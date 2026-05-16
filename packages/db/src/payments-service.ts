import { Prisma } from '@prisma/client';
import type {
  InstallmentStatus,
  PaymentMethod,
  PlanStatus,
  PropertyStatus,
} from '@prisma/client';
import { allocatePayment, reverse } from '@solutio/shared/payments';
import type { PaymentRecordInput } from '@solutio/shared/payments';
import type { Kobo } from '@solutio/shared/money';
import type { TenantContext } from '@solutio/shared/tenant';
import { requireRole } from '@solutio/shared/tenant';
import { deriveInstallmentStatus } from '@solutio/shared/installments';
import { forTenant, type TenantPrismaClient } from './tenant-client';
import { prisma } from './client';
import { PlanNotFoundError, PropertyNotAvailableError } from './plan-errors';

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

/**
 * The payment being reversed was not found in the tenant's scope.
 * This covers both "doesn't exist" and "belongs to another tenant".
 */
export class PaymentNotFoundError extends Error {
  static readonly code = 'PAYMENT_NOT_FOUND' as const;
  readonly code = PaymentNotFoundError.code;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} not found`);
    this.name = 'PaymentNotFoundError';
  }
}

/**
 * The payment has already been reversed (@@unique on reversedById enforces this
 * at DB level; we also check eagerly before the write attempt).
 */
export class PaymentAlreadyReversedError extends Error {
  static readonly code = 'PAYMENT_ALREADY_REVERSED' as const;
  readonly code = PaymentAlreadyReversedError.code;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} has already been reversed`);
    this.name = 'PaymentAlreadyReversedError';
  }
}

/**
 * Caller attempted to reverse a row that is itself a reversal
 * (i.e. reversedById is set on the payment being reversed).
 * Reversing-a-reversal is not allowed to prevent double-negation loops.
 */
export class CannotReverseReversalRowError extends Error {
  static readonly code = 'CANNOT_REVERSE_REVERSAL_ROW' as const;
  readonly code = CannotReverseReversalRowError.code;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} is itself a reversal and cannot be reversed`);
    this.name = 'CannotReverseReversalRowError';
  }
}

export type { PaymentRecordInput };

export type ReversePaymentInput = {
  paymentId: string;
  notes?: string;
};

export type ReversePaymentResult = {
  reversalPaymentId: string;
  planStatus: PlanStatus;
};

type AllocationRow = { installmentId: string; amountKobo: Kobo };

export type RecordPaymentResult = {
  paymentId: string;
  planStatus: PlanStatus;
  remainderKobo: Kobo;
};

/**
 * Transaction client type as exposed inside `forTenant(...).$transaction(async (tx) => ...)`.
 * Captures the tenant-scoped extension so injected tenantId still applies inside the callback.
 */
export type TenantTransactionClient = Parameters<
  Parameters<TenantPrismaClient['$transaction']>[0]
>[0];

export type InstallmentForPayment = {
  id: string;
  sequenceNo: number;
  dueDate: Date;
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
  status: InstallmentStatus;
};

export type PlanForPayment = {
  id: string;
  propertyId: string;
  status: PlanStatus;
  property: { id: string; status: PropertyStatus };
};

export type PreparedAllocations = ReadonlyArray<{ installmentId: string; amountKobo: Kobo }>;

export type PaymentWriteInput = {
  amountKobo: Kobo;
  paidAt: Date;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
};

/**
 * Internal helper — the post-validation write phase shared by `recordPayment`
 * and `plans-service.createPlan`'s `depositReceived: true` branch.
 *
 * Callers MUST have already:
 *   - re-read the plan inside the active transaction
 *   - validated plan status (not COMPLETED/CANCELLED/DEFAULTED)
 *   - validated paidAt vs plan.startDate
 *   - computed and validated the allocation list (FIFO or manual)
 *
 * This helper performs:
 *   1. Payment row insert
 *   2. PaymentAllocation rows + Installment paid/status updates (via deriveInstallmentStatus)
 *   3. Plan transitions:
 *      - DRAFT → ACTIVE (or COMPLETED if everything is now paid) + property AVAILABLE → SOLD
 *      - ACTIVE → COMPLETED when every installment is fully paid
 *
 * NOT exported via index.ts — keep this private to the M4 service layer.
 */
export async function applyPayment(
  tx: TenantTransactionClient,
  plan: PlanForPayment,
  installments: InstallmentForPayment[],
  paymentInput: PaymentWriteInput,
  allocations: PreparedAllocations,
  recordedByUserId: string,
): Promise<{ paymentId: string; planStatus: PlanStatus }> {
  const paymentData = {
    planId: plan.id,
    amountKobo: paymentInput.amountKobo,
    paidAt: paymentInput.paidAt,
    method: paymentInput.method,
    reference: paymentInput.reference ?? null,
    notes: paymentInput.notes ?? null,
    recordedBy: recordedByUserId,
  } satisfies Omit<Prisma.PaymentUncheckedCreateInput, 'tenantId'>;
  const payment = await tx.payment.create({
    data: paymentData as unknown as Prisma.PaymentUncheckedCreateInput,
  });

  // Local copy of installment state so we can decide allPaid after the loop
  // without re-querying.
  const installmentState = installments.map((i) => ({
    id: i.id,
    sequenceNo: i.sequenceNo,
    amountDueKobo: i.amountDueKobo,
    amountPaidKobo: i.amountPaidKobo,
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

  const allPaid = installmentState.every((i) => i.amountPaidKobo >= i.amountDueKobo);
  let nextStatus: PlanStatus = plan.status;

  if (plan.status === 'DRAFT') {
    nextStatus = allPaid ? 'COMPLETED' : 'ACTIVE';
    await tx.plan.update({
      where: { id: plan.id },
      data: { status: nextStatus },
    });
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

  return { paymentId: payment.id, planStatus: nextStatus };
}

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
export type PaymentListRow = {
  id: string;
  amountKobo: Kobo;
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  recordedByUserId: string;
  /**
   * Joined from the User table via a secondary findMany (Payment.recordedBy has no
   * Prisma relation back to User in M4 — we keep the schema unchanged). `null` when
   * the recorder's User row no longer exists in the tenant scope.
   */
  recordedByName: string | null;
  createdAt: Date;
  allocations: Array<{
    id: string;
    installmentId: string;
    installmentSequenceNo: number;
    amountKobo: Kobo;
  }>;
  /** Non-null when this row is itself a reversal — points to the original payment id. */
  reversedById: string | null;
  /** Non-null when this row has been reversed — points to the reversal payment id. */
  reversedByPaymentId: string | null;
};

/**
 * Tenant-scoped list of payments for a plan, ordered most-recent first.
 *
 * Includes per-payment allocations (ordered by installment sequenceNo asc) and
 * the recorder's display name (joined manually via a second `user.findMany`,
 * since the M4 schema does not define a Payment → User relation).
 *
 * Does not filter or include reversal/reversed metadata — that ships in a
 * later milestone alongside the reversal workflow itself.
 */
export async function listPaymentsForPlan(
  ctx: TenantContext,
  planId: string,
): Promise<PaymentListRow[]> {
  const scoped = forTenant(prisma, ctx.tenantId);

  const payments = await scoped.payment.findMany({
    where: { planId },
    orderBy: { paidAt: 'desc' },
    include: {
      allocations: {
        include: {
          installment: { select: { sequenceNo: true } },
        },
      },
    },
  });

  if (payments.length === 0) return [];

  const recorderIds = Array.from(new Set(payments.map((p) => p.recordedBy)));
  const users = await scoped.user.findMany({
    where: { id: { in: recorderIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // Single extra round-trip to find any reversal rows that point back to
  // payments in this list. Builds originalId → reversalId for the UI.
  const paymentIds = payments.map((p) => p.id);
  const reversalLinks = await scoped.payment.findMany({
    where: { reversedById: { in: paymentIds } },
    select: { id: true, reversedById: true },
  });
  const reversedByPaymentIdMap = new Map(
    reversalLinks
      .filter((r): r is { id: string; reversedById: string } => r.reversedById !== null)
      .map((r) => [r.reversedById, r.id]),
  );

  return payments.map((p) => ({
    id: p.id,
    amountKobo: p.amountKobo as Kobo,
    paidAt: p.paidAt,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    recordedByUserId: p.recordedBy,
    recordedByName: nameById.get(p.recordedBy) ?? null,
    createdAt: p.createdAt,
    allocations: p.allocations
      .slice()
      .sort((a, b) => a.installment.sequenceNo - b.installment.sequenceNo)
      .map((a) => ({
        id: a.id,
        installmentId: a.installmentId,
        installmentSequenceNo: a.installment.sequenceNo,
        amountKobo: a.amountKobo as Kobo,
      })),
    reversedById: p.reversedById,
    reversedByPaymentId: reversedByPaymentIdMap.get(p.id) ?? null,
  }));
}

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

        const installmentsForWrite: InstallmentForPayment[] = plan.installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          dueDate: i.dueDate,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
          status: i.status,
        }));
        const { paymentId, planStatus } = await applyPayment(
          tx,
          {
            id: plan.id,
            propertyId: plan.propertyId,
            status: plan.status,
            property: { id: plan.property.id, status: plan.property.status },
          },
          installmentsForWrite,
          {
            amountKobo: input.amountKobo,
            paidAt: input.paidAt,
            method: input.method,
            reference: input.reference,
            notes: input.notes,
          },
          allocations,
          ctx.user.id,
        );

        return {
          paymentId,
          planStatus,
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

/**
 * Internal helper — the write phase for payment reversal. Symmetrical to
 * `applyPayment` but operates in reverse: inserts a negative Payment row,
 * negative PaymentAllocation rows, decrements installment amountPaidKobo,
 * and walks the plan status COMPLETED → ACTIVE if applicable.
 *
 * NOT exported via index.ts — keep this private to the M5 service layer.
 *
 * @throws {Error} 'Reversal underflow' if computed newPaid < 0 (data corruption guard).
 */
async function applyReversal(
  tx: TenantTransactionClient,
  original: {
    id: string;
    planId: string;
    amountKobo: Kobo;
    paidAt: Date;
    method: PaymentMethod;
    reference: string | null;
    reversedById: string | null;
  },
  originalAllocations: ReadonlyArray<{ installmentId: string; amountKobo: Kobo }>,
  installments: InstallmentForPayment[],
  plan: { id: string; status: PlanStatus },
  reversalNotes: string | undefined,
  recordedByUserId: string,
): Promise<{ reversalPaymentId: string; planStatus: PlanStatus }> {
  const notes = reversalNotes ? `[Reversal] ${reversalNotes}` : '[Reversal]';

  const reversalPaymentData = {
    planId: original.planId,
    amountKobo: (-original.amountKobo) as Kobo,
    paidAt: new Date(),
    method: original.method,
    reference: original.reference,
    notes,
    recordedBy: recordedByUserId,
    reversedById: original.id,
  } satisfies Omit<Prisma.PaymentUncheckedCreateInput, 'tenantId'>;

  const reversalPayment = await tx.payment.create({
    data: reversalPaymentData as unknown as Prisma.PaymentUncheckedCreateInput,
  });

  // Build a Map of installment state for O(1) lookup
  const installmentStateById = new Map(
    installments.map((i) => ({
      id: i.id,
      amountDueKobo: i.amountDueKobo,
      amountPaidKobo: i.amountPaidKobo,
      dueDate: i.dueDate,
      status: i.status,
    })).map((i) => [i.id, i]),
  );

  const today = new Date();
  for (const alloc of originalAllocations) {
    const negatedAmount = (-alloc.amountKobo) as Kobo;

    const allocData = {
      paymentId: reversalPayment.id,
      installmentId: alloc.installmentId,
      amountKobo: negatedAmount,
    } satisfies Omit<Prisma.PaymentAllocationUncheckedCreateInput, 'tenantId'>;
    await tx.paymentAllocation.create({
      data: allocData as unknown as Prisma.PaymentAllocationUncheckedCreateInput,
    });

    const inst = installmentStateById.get(alloc.installmentId)!;
    const newPaid = (inst.amountPaidKobo + negatedAmount) as Kobo;

    // Sanity guard: newPaid < 0 means the data store is corrupt.
    if (newPaid < 0n) {
      throw new Error(
        `Reversal underflow for installment ${alloc.installmentId}: newPaid=${newPaid}`,
      );
    }

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

    // Update local copy for consistency (not used again, but keeps pattern parallel to applyPayment)
    inst.amountPaidKobo = newPaid;
    inst.status = newStatus;
  }

  // Plan transition: COMPLETED → ACTIVE only. All other statuses are left alone.
  let nextPlanStatus: PlanStatus = plan.status;
  if (plan.status === 'COMPLETED') {
    nextPlanStatus = 'ACTIVE';
    await tx.plan.update({
      where: { id: plan.id },
      data: { status: 'ACTIVE' },
    });
  }

  return { reversalPaymentId: reversalPayment.id, planStatus: nextPlanStatus };
}

/**
 * Service function — reverses a previously recorded Payment.
 *
 * M5 invariants:
 *   • Only OWNER and ADMIN may reverse payments; STAFF is rejected with ForbiddenError.
 *   • The payment must exist in the caller's tenant scope → PaymentNotFoundError.
 *   • The payment must not itself be a reversal row → CannotReverseReversalRowError.
 *   • The payment must not already have a reversal → PaymentAlreadyReversedError
 *     (caught from the @@unique constraint P2002 or from the eager re-read check).
 *   • Installment amountPaidKobo is decremented; status is re-derived via deriveInstallmentStatus.
 *   • Plan COMPLETED → ACTIVE if the reversal removes the final payment that completed it.
 *   • Property status is NOT touched by reversal.
 *
 * All writes happen in a single SERIALIZABLE transaction. Loss of the write
 * race surfaces as PaymentRetryableSerializationError so the caller can retry.
 */
export async function reversePayment(
  ctx: TenantContext,
  input: ReversePaymentInput,
): Promise<ReversePaymentResult> {
  requireRole(ctx, ['OWNER', 'ADMIN']);

  const scoped = forTenant(prisma, ctx.tenantId);

  try {
    return await scoped.$transaction(
      async (tx) => {
        // Re-read original payment with its allocations and plan inside the transaction
        const original = await tx.payment.findUnique({
          where: { id: input.paymentId },
          include: {
            allocations: true,
            plan: true,
          },
        });

        if (!original) throw new PaymentNotFoundError(input.paymentId);

        // A reversal row has reversedById set — refuse to reverse-a-reversal
        if (original.reversedById !== null) {
          throw new CannotReverseReversalRowError(input.paymentId);
        }

        // Eagerly check if already reversed (@@unique will also catch race)
        const existingReversal = await tx.payment.findUnique({
          where: { reversedById: input.paymentId },
          select: { id: true },
        });
        if (existingReversal !== null) {
          throw new PaymentAlreadyReversedError(input.paymentId);
        }

        // Fetch the affected installments (only those referenced by original allocations)
        const allocationInstallmentIds = original.allocations.map((a) => a.installmentId);
        const installments = await tx.installment.findMany({
          where: { id: { in: allocationInstallmentIds } },
        });

        const installmentsForWrite: InstallmentForPayment[] = installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          dueDate: i.dueDate,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
          status: i.status,
        }));

        // Compute the ReversalPlan (validates invariants on original data)
        const originalAllocations = original.allocations.map((a) => ({
          installmentId: a.installmentId,
          amountKobo: a.amountKobo as Kobo,
        }));

        // Validate via reverse() — throws ReversalInvariantError if data is corrupt
        reverse({ amountKobo: original.amountKobo as Kobo, allocations: originalAllocations });

        // Apply the reversal writes
        return await applyReversal(
          tx,
          {
            id: original.id,
            planId: original.planId,
            amountKobo: original.amountKobo as Kobo,
            paidAt: original.paidAt,
            method: original.method,
            reference: original.reference,
            reversedById: original.reversedById,
          },
          originalAllocations,
          installmentsForWrite,
          { id: original.plan.id, status: original.plan.status },
          input.notes,
          ctx.user.id,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 on reversedById unique constraint → race condition, already reversed
      if (err.code === 'P2002') {
        throw new PaymentAlreadyReversedError(input.paymentId);
      }
      // P2034 → serialization failure, caller should retry
      if (err.code === 'P2034') {
        throw new PaymentRetryableSerializationError();
      }
    }
    throw err;
  }
}
