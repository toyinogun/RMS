import { Prisma } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import type {
  PlanCreateInput,
  PlanCancelInput,
  PlanListFilterInput,
} from '@solutio/shared/installments';
import { generateSchedule } from '@solutio/shared/installments';
import { allocatePayment } from '@solutio/shared/payments';
import type { Kobo } from '@solutio/shared/money';
import { forTenant } from './tenant-client';
import { prisma } from './client';
import { CustomerNotFoundError } from './customers-service';
import {
  applyPayment,
  type InstallmentForPayment,
  type PlanForPayment,
} from './payments-service';

export { CustomerNotFoundError };

export class PlanNotFoundError extends Error {
  constructor(id: string) {
    super(`Plan not found: ${id}`);
    this.name = 'PlanNotFoundError';
  }
}

export class PlanHasPaymentsError extends Error {
  constructor(id: string, paymentCount: number) {
    super(`Cannot cancel plan ${id}: ${paymentCount} payment(s) recorded — reverse payments first`);
    this.name = 'PlanHasPaymentsError';
  }
}

export class PropertyNotAvailableError extends Error {
  constructor(propertyId: string, currentStatus: string) {
    super(`Property ${propertyId} is not available (status: ${currentStatus})`);
    this.name = 'PropertyNotAvailableError';
  }
}

export async function createPlan(
  ctx: TenantContext,
  input: PlanCreateInput,
): Promise<{ id: string }> {
  const scoped = forTenant(prisma, ctx.tenantId);
  // SERIALIZABLE for both branches: the property re-read → plan/installment
  // create sequence has the same write-race window whether or not we also
  // record the deposit, so we lock in repeatable-write semantics across the
  // board. Cost is negligible at our scale.
  return scoped.$transaction(
    async (tx) => {
      let customerId: string;
      if (input.customer.mode === 'new') {
        const customerData = {
          fullName: input.customer.fullName,
          phone: input.customer.phone,
          email: input.customer.email ?? null,
          nationalId: input.customer.nationalId ?? null,
          notes: input.customer.notes ?? null,
          createdBy: ctx.user.id,
        } satisfies Omit<Prisma.CustomerUncheckedCreateInput, 'tenantId'>;
        const newCustomer = await tx.customer.create({
          data: customerData as unknown as Prisma.CustomerUncheckedCreateInput,
        });
        customerId = newCustomer.id;
      } else {
        const existing = await tx.customer.findUnique({ where: { id: input.customer.id } });
        if (!existing || existing.deletedAt) throw new CustomerNotFoundError(input.customer.id);
        customerId = existing.id;
      }

      // Re-read the property inside the transaction (spec §134 concurrency rule).
      // In the deposit-false branch the plan stays DRAFT so we don't flip the
      // property, but we still refuse to start the plan if the property is
      // not AVAILABLE. In the deposit-true branch applyPayment will flip
      // AVAILABLE → SOLD as part of the same transaction.
      const property = await tx.property.findUnique({ where: { id: input.propertyId } });
      if (!property || property.deletedAt) {
        throw new PropertyNotAvailableError(input.propertyId, 'not found');
      }
      if (property.status !== 'AVAILABLE') {
        throw new PropertyNotAvailableError(input.propertyId, property.status);
      }

      const planData = {
        customerId,
        propertyId: input.propertyId,
        totalPriceKobo: input.totalPriceKobo,
        depositKobo: input.depositKobo,
        monthlyKobo: input.monthlyKobo,
        termMonths: input.termMonths,
        startDate: input.startDate,
        status: 'DRAFT',
        createdBy: ctx.user.id,
      } satisfies Omit<Prisma.PlanUncheckedCreateInput, 'tenantId'>;
      const plan = await tx.plan.create({
        data: planData as unknown as Prisma.PlanUncheckedCreateInput,
      });

      const schedule = generateSchedule({
        totalPriceKobo: input.totalPriceKobo,
        depositKobo: input.depositKobo,
        monthlyKobo: input.monthlyKobo,
        termMonths: input.termMonths,
        startDate: input.startDate,
      });

      const installmentRows = schedule.map(
        (row) =>
          ({
            planId: plan.id,
            sequenceNo: row.sequenceNo,
            dueDate: row.dueDate,
            amountDueKobo: row.amountDueKobo,
            amountPaidKobo: 0n,
            status: 'PENDING' as const,
          }) satisfies Omit<Prisma.InstallmentUncheckedCreateInput, 'tenantId'>,
      );
      await tx.installment.createMany({
        data: installmentRows as unknown as Prisma.InstallmentUncheckedCreateInput[],
      });

      if (input.depositReceived) {
        // Defense in depth: the schema enforces depositMethod present + depositKobo > 0
        // under depositReceived:true, but assert at runtime to keep the boundary explicit.
        if (input.depositMethod === undefined) {
          throw new Error('depositMethod is required when depositReceived is true');
        }
        if (input.depositKobo <= 0n) {
          throw new Error('depositKobo must be > 0 when depositReceived is true');
        }

        // Re-load installments to get the generated ids in sequence order.
        const persistedInstallments = await tx.installment.findMany({
          where: { planId: plan.id },
          orderBy: { sequenceNo: 'asc' },
        });

        const fifo = allocatePayment(
          input.depositKobo,
          persistedInstallments.map((i) => ({
            id: i.id,
            sequenceNo: i.sequenceNo,
            amountDueKobo: i.amountDueKobo as Kobo,
            amountPaidKobo: i.amountPaidKobo as Kobo,
          })),
        );
        // Schema invariants (depositKobo > 0 and <= totalPriceKobo) guarantee
        // the FIFO walk consumes everything — assert as a sanity check.
        if (fifo.remainderKobo > 0n) {
          throw new Error(
            `Deposit FIFO produced remainder ${fifo.remainderKobo} — schema invariants violated`,
          );
        }

        const planForPayment: PlanForPayment = {
          id: plan.id,
          propertyId: property.id,
          status: 'DRAFT',
          property: { id: property.id, status: 'AVAILABLE' },
        };
        const installmentsForPayment: InstallmentForPayment[] = persistedInstallments.map(
          (i) => ({
            id: i.id,
            sequenceNo: i.sequenceNo,
            dueDate: i.dueDate,
            amountDueKobo: i.amountDueKobo as Kobo,
            amountPaidKobo: i.amountPaidKobo as Kobo,
            status: i.status,
          }),
        );
        await applyPayment(
          tx,
          planForPayment,
          installmentsForPayment,
          {
            amountKobo: input.depositKobo,
            paidAt: input.depositPaidAt ?? input.startDate,
            method: input.depositMethod,
            reference: input.depositReference,
            notes: input.depositNotes,
          },
          fifo.allocations.map((a) => ({
            installmentId: a.installmentId,
            amountKobo: a.amountKobo,
          })),
          ctx.user.id,
        );
      }

      return { id: plan.id };
    },
    { isolationLevel: 'Serializable' },
  );
}

export async function cancelPlan(ctx: TenantContext, input: PlanCancelInput): Promise<void> {
  const scoped = forTenant(prisma, ctx.tenantId);
  await scoped.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({
      where: { id: input.id },
      include: {
        payments: { select: { id: true }, take: 1 },
      },
    });
    if (!plan || plan.deletedAt) throw new PlanNotFoundError(input.id);
    if (plan.status === 'CANCELLED') return;
    if (plan.payments.length > 0) {
      const count = await tx.payment.count({ where: { planId: input.id } });
      throw new PlanHasPaymentsError(input.id, count);
    }
    await tx.plan.update({ where: { id: input.id }, data: { status: 'CANCELLED' } });
  });
}

export async function listPlans(ctx: TenantContext, filter: PlanListFilterInput) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const statusFilter =
    filter.status && filter.status !== 'ALL' ? { status: filter.status } : {};
  const q = filter.q;
  const searchFilter = q
    ? {
        OR: [
          { customer: { fullName: { contains: q, mode: 'insensitive' as const } } },
          { property: { code: { contains: q.toUpperCase() } } },
        ],
      }
    : {};
  return scoped.plan.findMany({
    where: { deletedAt: null, ...statusFilter, ...searchFilter },
    select: {
      id: true,
      status: true,
      createdAt: true,
      totalPriceKobo: true,
      termMonths: true,
      customer: { select: { id: true, fullName: true } },
      property: { select: { id: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getPlan(ctx: TenantContext, id: string) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const plan = await scoped.plan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      property: { select: { id: true, code: true, title: true, status: true } },
      installments: { orderBy: { sequenceNo: 'asc' } },
    },
  });
  if (!plan || plan.deletedAt) return null;
  return plan;
}
