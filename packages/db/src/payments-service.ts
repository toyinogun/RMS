import { Prisma } from '@prisma/client';
import type { PlanStatus } from '@prisma/client';
import { allocatePayment } from '@solutio/shared/payments';
import type { PaymentRecordInput } from '@solutio/shared/payments';
import type { Kobo } from '@solutio/shared/money';
import type { TenantContext } from '@solutio/shared/tenant';
import { deriveInstallmentStatus } from '@solutio/shared/installments';
import { forTenant } from './tenant-client';
import { prisma } from './client';
import { PlanNotFoundError, PropertyNotAvailableError } from './plans-service';

export { PlanNotFoundError, PropertyNotAvailableError };

/**
 * The plan was found but it's not in a state that accepts new payments.
 * Currently blocks COMPLETED, CANCELLED, DEFAULTED. DRAFT and ACTIVE are accepted.
 */
export class PlanNotPayableError extends Error {
  static readonly code = 'PLAN_NOT_PAYABLE' as const;
  readonly code = PlanNotPayableError.code;
  constructor(planId: string, status: PlanStatus) {
    super(`Plan ${planId} is not payable (status: ${status})`);
    this.name = 'PlanNotPayableError';
  }
}

/**
 * paidAt is earlier than the plan's startDate.
 */
export class PaymentBeforePlanStartError extends Error {
  static readonly code = 'PAYMENT_BEFORE_PLAN_START' as const;
  readonly code = PaymentBeforePlanStartError.code;
  constructor(paidAt: Date, startDate: Date) {
    super(
      `Payment date ${paidAt.toISOString()} is before plan start date ${startDate.toISOString()}`,
    );
    this.name = 'PaymentBeforePlanStartError';
  }
}

/**
 * FIFO allocation produced a non-zero remainder — i.e. the caller paid more
 * than the plan's outstanding balance. M4 hard-rejects overpayments instead
 * of silently keeping the change as a credit.
 */
export class PaymentOverpayError extends Error {
  static readonly code = 'PAYMENT_OVERPAY' as const;
  readonly code = PaymentOverpayError.code;
  readonly overpayKobo: Kobo;
  constructor(overpayKobo: Kobo) {
    super(`Payment exceeds plan outstanding by ${overpayKobo} kobo`);
    this.name = 'PaymentOverpayError';
    this.overpayKobo = overpayKobo;
  }
}

/**
 * Manual allocation references an installmentId that doesn't belong to the
 * plan (or doesn't exist in the caller's tenant scope).
 */
export class AllocationInstallmentNotFoundError extends Error {
  static readonly code = 'ALLOCATION_INSTALLMENT_NOT_FOUND' as const;
  readonly code = AllocationInstallmentNotFoundError.code;
  constructor(installmentId: string) {
    super(`Allocation references unknown installment ${installmentId}`);
    this.name = 'AllocationInstallmentNotFoundError';
  }
}

/**
 * Manual allocation tries to credit an installment that is already PAID.
 */
export class AllocationAgainstPaidInstallmentError extends Error {
  static readonly code = 'ALLOCATION_AGAINST_PAID_INSTALLMENT' as const;
  readonly code = AllocationAgainstPaidInstallmentError.code;
  readonly sequenceNo: number;
  constructor(sequenceNo: number) {
    super(`Installment #${sequenceNo} is already paid`);
    this.name = 'AllocationAgainstPaidInstallmentError';
    this.sequenceNo = sequenceNo;
  }
}

/** Same installment appears twice in the manual override allocations. */
export class AllocationDuplicateInstallmentError extends Error {
  static readonly code = 'ALLOCATION_DUPLICATE_INSTALLMENT' as const;
  readonly code = AllocationDuplicateInstallmentError.code;
  constructor(public readonly installmentId: string) {
    super(`Allocation list contains installment ${installmentId} more than once`);
    this.name = 'AllocationDuplicateInstallmentError';
  }
}

/**
 * Manual allocation row amount exceeds the installment's outstanding balance.
 */
export class AllocationExceedsOutstandingError extends Error {
  static readonly code = 'ALLOCATION_EXCEEDS_OUTSTANDING' as const;
  readonly code = AllocationExceedsOutstandingError.code;
  readonly sequenceNo: number;
  constructor(sequenceNo: number) {
    super(`Allocation for installment #${sequenceNo} exceeds outstanding balance`);
    this.name = 'AllocationExceedsOutstandingError';
    this.sequenceNo = sequenceNo;
  }
}

/**
 * SERIALIZABLE transaction lost a write race (Postgres SQLSTATE 40001 →
 * Prisma P2034). The action layer should retry once before surfacing.
 */
export class PaymentRetryableSerializationError extends Error {
  static readonly code = 'PAYMENT_RETRYABLE_SERIALIZATION' as const;
  readonly code = PaymentRetryableSerializationError.code;
  constructor() {
    super('Payment transaction failed due to serialization conflict — retry');
    this.name = 'PaymentRetryableSerializationError';
  }
}

export type { PaymentRecordInput };

type AllocationRow = { installmentId: string; amountKobo: Kobo };

export type RecordPaymentResult = {
  paymentId: string;
  planStatus: PlanStatus;
  remainderKobo: Kobo;
};

/**
 * Compare two dates by calendar day (UTC). `startDate` is a `@db.Date` column
 * so it always lands at 00:00:00 UTC, while `paidAt` is a `DateTime` and may
 * carry a wall-clock time. We reject when the paid day is strictly before the
 * start day — a payment recorded at any time on the start day is acceptable.
 */
function isPaidAtBeforeStart(paidAt: Date, startDate: Date): boolean {
  const paidDay = Date.UTC(
    paidAt.getUTCFullYear(),
    paidAt.getUTCMonth(),
    paidAt.getUTCDate(),
  );
  const startDay = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  return paidDay < startDay;
}

/**
 * Service function — records a Payment against a Plan and applies the M4
 * invariants:
 *   • DRAFT plan + first payment → plan ACTIVE, property AVAILABLE → SOLD
 *     (idempotent: property already SOLD/RESERVED is left alone).
 *   • If every installment is fully paid after this payment → plan COMPLETED.
 *   • COMPLETED / CANCELLED / DEFAULTED plans reject all new payments.
 *   • paidAt before startDate is rejected.
 *   • FIFO allocation runs when no explicit allocations[] is provided.
 *     Overpayments (remainder > 0) are hard-rejected.
 *   • Manual allocations[] are validated for membership, paid-state, and
 *     outstanding bounds.
 *
 * All writes happen in a single SERIALIZABLE transaction. Loss of the write
 * race surfaces as PaymentRetryableSerializationError so the caller can retry.
 */
export async function recordPayment(
  ctx: TenantContext,
  input: PaymentRecordInput,
): Promise<RecordPaymentResult> {
  const scoped = forTenant(prisma, ctx.tenantId);

  try {
    return await scoped.$transaction(
      async (tx) => {
        const plan = await tx.plan.findUnique({
          where: { id: input.planId },
          include: {
            installments: { orderBy: { sequenceNo: 'asc' } },
            property: true,
          },
        });
        if (!plan || plan.deletedAt !== null) throw new PlanNotFoundError(input.planId);
        if (
          plan.status === 'COMPLETED' ||
          plan.status === 'CANCELLED' ||
          plan.status === 'DEFAULTED'
        ) {
          throw new PlanNotPayableError(plan.id, plan.status);
        }
        if (isPaidAtBeforeStart(input.paidAt, plan.startDate)) {
          throw new PaymentBeforePlanStartError(input.paidAt, plan.startDate);
        }

        // Determine the allocation list: either compute FIFO, or validate the
        // caller-supplied rows. Either way, end with a normalized list of
        // { installmentId, amountKobo }.
        let allocations: AllocationRow[];

        if (input.allocations === undefined) {
          const result = allocatePayment(
            input.amountKobo,
            plan.installments.map((i) => ({
              id: i.id,
              sequenceNo: i.sequenceNo,
              amountDueKobo: i.amountDueKobo as Kobo,
              amountPaidKobo: i.amountPaidKobo as Kobo,
            })),
          );
          if (result.remainderKobo > 0n) {
            throw new PaymentOverpayError(result.remainderKobo);
          }
          allocations = result.allocations.map((a) => ({
            installmentId: a.installmentId,
            amountKobo: a.amountKobo,
          }));
        } else {
          const byId = new Map(plan.installments.map((i) => [i.id, i]));
          const seen = new Set<string>();
          for (const row of input.allocations) {
            if (seen.has(row.installmentId)) {
              throw new AllocationDuplicateInstallmentError(row.installmentId);
            }
            seen.add(row.installmentId);
            const inst = byId.get(row.installmentId);
            if (!inst) throw new AllocationInstallmentNotFoundError(row.installmentId);
            if (inst.status === 'PAID') {
              throw new AllocationAgainstPaidInstallmentError(inst.sequenceNo);
            }
            const newPaid = (inst.amountPaidKobo as Kobo) + row.amountKobo;
            if (newPaid > (inst.amountDueKobo as Kobo)) {
              throw new AllocationExceedsOutstandingError(inst.sequenceNo);
            }
          }
          allocations = input.allocations.map((a) => ({
            installmentId: a.installmentId,
            amountKobo: a.amountKobo,
          }));
        }

        const paymentData = {
          planId: input.planId,
          amountKobo: input.amountKobo,
          paidAt: input.paidAt,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedBy: ctx.user.id,
        } satisfies Omit<Prisma.PaymentUncheckedCreateInput, 'tenantId'>;
        const payment = await tx.payment.create({
          data: paymentData as unknown as Prisma.PaymentUncheckedCreateInput,
        });

        // Build a local copy of installment state so we can both compute the
        // post-payment status (DRAFT→ACTIVE→COMPLETED in one shot) and feed
        // deriveInstallmentStatus the right currentStatus for each row.
        const installmentState = plan.installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
          dueDate: i.dueDate,
          status: i.status,
        }));
        const stateById = new Map(installmentState.map((i) => [i.id, i]));

        const today = new Date();
        for (const alloc of allocations) {
          const allocData = {
            paymentId: payment.id,
            installmentId: alloc.installmentId,
            amountKobo: alloc.amountKobo,
          } satisfies Omit<Prisma.PaymentAllocationUncheckedCreateInput, 'tenantId'>;
          await tx.paymentAllocation.create({
            data: allocData as unknown as Prisma.PaymentAllocationUncheckedCreateInput,
          });
          const inst = stateById.get(alloc.installmentId)!;
          const newPaid = (inst.amountPaidKobo + alloc.amountKobo) as Kobo;
          const newStatus = deriveInstallmentStatus({
            amountDueKobo: inst.amountDueKobo,
            amountPaidKobo: newPaid,
            dueDate: inst.dueDate,
            currentStatus: inst.status,
            today,
          });
          await tx.installment.update({
            where: { id: alloc.installmentId },
            data: { amountPaidKobo: newPaid, status: newStatus },
          });
          // Local mutation is deliberate: installmentState is a transaction-scoped copy
          // used to compute the post-write allPaid check without a second findMany.
          inst.amountPaidKobo = newPaid;
          inst.status = newStatus;
        }

        // Plan + property state transitions. Collapse DRAFT→ACTIVE→COMPLETED
        // into a single plan.update by computing the final status up-front.
        const allPaid = installmentState.every(
          (i) => i.amountPaidKobo >= i.amountDueKobo,
        );
        let nextStatus: PlanStatus = plan.status;

        if (plan.status === 'DRAFT') {
          nextStatus = allPaid ? 'COMPLETED' : 'ACTIVE';
          await tx.plan.update({
            where: { id: plan.id },
            data: { status: nextStatus },
          });
          // Property auto-flip is idempotent: only write if AVAILABLE.
          if (plan.property.status === 'AVAILABLE') {
            await tx.property.update({
              where: { id: plan.propertyId },
              data: { status: 'SOLD' },
            });
          }
        } else if (allPaid) {
          nextStatus = 'COMPLETED';
          await tx.plan.update({
            where: { id: plan.id },
            data: { status: 'COMPLETED' },
          });
        }

        return {
          paymentId: payment.id,
          planStatus: nextStatus,
          remainderKobo: 0n as Kobo,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    // Postgres SQLSTATE 40001 (serialization_failure) surfaces from
    // Prisma as P2034 ("Transaction failed due to a write conflict or a
    // deadlock"). Re-wrap so the action layer can decide whether to retry.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2034'
    ) {
      throw new PaymentRetryableSerializationError();
    }
    throw err;
  }
}
