import { Prisma, PrismaClient } from '@prisma/client';
import { allocatePayment } from '@solutio/shared/payments';
import type { Kobo } from '@solutio/shared/money';
import type { TenantContext } from '@solutio/shared/tenant';
import { deriveInstallmentStatus } from '@solutio/shared/installments';
import { forTenant } from './tenant-client';

export type RecordPaymentInput = {
  planId: string;
  amountKobo: Kobo;
  paidAt: Date;
  method: 'CASH' | 'TRANSFER' | 'CHEQUE' | 'CARD_MANUAL' | 'OTHER';
  reference?: string;
  notes?: string;
};

/**
 * Service function — records a Payment, computes allocations across the Plan's
 * outstanding installments, persists them, updates the denormalized
 * Installment.amountPaidKobo running total, and refreshes Installment.status.
 * All writes happen in a single SERIALIZABLE transaction.
 *
 * Note: Prisma 7 with adapter-pg supports SERIALIZABLE isolation level via
 * the $transaction options. If the adapter does not support it at runtime,
 * this will throw and must be caught by the caller.
 */
export async function recordPayment(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: RecordPaymentInput,
) {
  // Apply tenant scoping before the transaction so the extended client's
  // $transaction propagates the extension into the interactive tx callback.
  // This is necessary because Prisma's interactive transaction client does not
  // expose $extends — only a fully-constructed PrismaClient does.
  const scoped = forTenant(prisma, ctx.tenantId);

  return scoped.$transaction(
    async (tx) => {
      const installments = await tx.installment.findMany({
        where: { planId: input.planId },
        orderBy: { sequenceNo: 'asc' },
      });

      const result = allocatePayment(
        input.amountKobo,
        installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
        })),
      );

      // tenantId is injected at runtime by forTenant()'s $extends query hook,
      // but Prisma's generated input types don't reflect that. Shape is still
      // checked via `satisfies` against Omit<..., 'tenantId'>.
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

      const today = new Date();
      for (const alloc of result.allocations) {
        const allocData = {
          paymentId: payment.id,
          installmentId: alloc.installmentId,
          amountKobo: alloc.amountKobo,
        } satisfies Omit<Prisma.PaymentAllocationUncheckedCreateInput, 'tenantId'>;
        await tx.paymentAllocation.create({
          data: allocData as unknown as Prisma.PaymentAllocationUncheckedCreateInput,
        });
        const inst = installments.find((i) => i.id === alloc.installmentId)!;
        const newPaid = (inst.amountPaidKobo + alloc.amountKobo) as Kobo;
        const newStatus = deriveInstallmentStatus({
          amountDueKobo: inst.amountDueKobo as Kobo,
          amountPaidKobo: newPaid,
          dueDate: inst.dueDate,
          currentStatus: inst.status,
          today,
        });
        await tx.installment.update({
          where: { id: alloc.installmentId },
          data: { amountPaidKobo: newPaid, status: newStatus },
        });
      }

      return { payment, allocations: result.allocations, remainderKobo: result.remainderKobo };
    },
    { isolationLevel: 'Serializable' },
  );
}
