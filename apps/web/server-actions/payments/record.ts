'use server';

import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import { paymentRecordSchema } from '@solutio/shared/payments';
import { formatKobo } from '@solutio/shared/money';
import {
  recordPayment,
  PlanNotPayableError,
  PaymentBeforePlanStartError,
  PaymentOverpayError,
  AllocationInstallmentNotFoundError,
  AllocationAgainstPaidInstallmentError,
  AllocationExceedsOutstandingError,
  AllocationDuplicateInstallmentError,
  PaymentRetryableSerializationError,
} from '@solutio/db/payments-service';
import type { RecordPaymentResult } from '@solutio/db/payments-service';
import { PlanNotFoundError } from '@solutio/db/plan-errors';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import { PAYMENT_RETRY_FAILURE_MESSAGE } from './messages';

// Reuse the service's PlanStatus shape without importing @prisma/client into
// apps/web — keeps the bundler off the generated Prisma runtime.
type PlanStatus = RecordPaymentResult['planStatus'];

const MAX_ALLOCATION_ROWS = 60; // Plans never exceed 36 installments; 60 leaves headroom.

export type PaymentRecordState =
  | { ok: true; data: { paymentId: string; planStatus: PlanStatus } }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function flattenZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/**
 * Reconstruct the optional `allocations[]` array from formData. The browser
 * serializes manual allocations as `allocations[0].installmentId`,
 * `allocations[0].amountNgn`, `allocations[1]...`, etc.
 *
 * Walk indices 0..N. A row is considered "present" if *either* the
 * installmentId key OR the amountNgn key exists in formData. Stop on the
 * first index where both are absent.
 *
 * - 0 rows present → return undefined (FIFO mode).
 * - ≥1 row present → return the array, including rows with empty strings
 *   so the schema can surface validation errors (do NOT silently drop
 *   half-filled rows).
 */
function buildAllocations(
  formData: FormData,
): Array<{ installmentId: string; amountNgn: string }> | undefined {
  const rows: Array<{ installmentId: string; amountNgn: string }> = [];
  for (let i = 0; i < MAX_ALLOCATION_ROWS; i++) {
    const idKey = `allocations[${i}].installmentId`;
    const amountKey = `allocations[${i}].amountNgn`;
    const hasId = formData.has(idKey);
    const hasAmount = formData.has(amountKey);
    if (!hasId && !hasAmount) break;
    rows.push({
      installmentId: formData.get(idKey)?.toString() ?? '',
      amountNgn: formData.get(amountKey)?.toString() ?? '',
    });
  }
  return rows.length === 0 ? undefined : rows;
}

export async function recordPaymentAction(
  _prev: PaymentRecordState | null,
  formData: FormData,
): Promise<PaymentRecordState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) {
    return { ok: false, message: 'Forbidden' };
  }

  const allocations = buildAllocations(formData);
  const parsed = paymentRecordSchema.safeParse({
    planId: formData.get('planId')?.toString() || '',
    amountNgn: formData.get('amountNgn')?.toString() || '',
    paidAt: formData.get('paidAt')?.toString() || '',
    method: formData.get('method')?.toString() || '',
    reference: formData.get('reference')?.toString() || undefined,
    notes: formData.get('notes')?.toString() || undefined,
    allocations,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: flattenZod(parsed.error),
    };
  }

  // Retry-once on SERIALIZABLE serialization conflict surfaced as
  // PaymentRetryableSerializationError. After the first loser re-snapshots
  // the plan rows, a second concurrent loser on the exact retry window is
  // unlikely. Any other thrown error short-circuits through error mapping.
  let result: { paymentId: string; planStatus: PlanStatus };
  try {
    result = await recordPayment(ctx, parsed.data);
  } catch (err) {
    if (err instanceof PaymentRetryableSerializationError) {
      try {
        result = await recordPayment(ctx, parsed.data);
      } catch (retryErr) {
        if (retryErr instanceof PaymentRetryableSerializationError) {
          return {
            ok: false,
            message: PAYMENT_RETRY_FAILURE_MESSAGE,
          };
        }
        return mapRecordPaymentError(retryErr);
      }
    } else {
      return mapRecordPaymentError(err);
    }
  }

  revalidatePath(`/plans/${parsed.data.planId}`);
  revalidatePath('/plans');
  revalidatePath('/properties');
  return {
    ok: true,
    data: { paymentId: result.paymentId, planStatus: result.planStatus },
  };
}

function mapRecordPaymentError(err: unknown): PaymentRecordState {
  if (err instanceof PlanNotFoundError) {
    return { ok: false, message: 'Plan no longer exists.' };
  }
  if (err instanceof PlanNotPayableError) {
    return { ok: false, message: 'This plan no longer accepts payments.' };
  }
  if (err instanceof PaymentBeforePlanStartError) {
    return {
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: { paidAt: 'Cannot record payment before plan start date.' },
    };
  }
  if (err instanceof PaymentOverpayError) {
    return {
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: {
        amountNgn: `Payment exceeds outstanding balance by ${formatKobo(err.overpayKobo)}.`,
      },
    };
  }
  if (err instanceof AllocationInstallmentNotFoundError) {
    return {
      ok: false,
      message: 'One or more allocations target an unknown installment. Refresh and try again.',
    };
  }
  if (err instanceof AllocationAgainstPaidInstallmentError) {
    return {
      ok: false,
      message: `Installment #${err.sequenceNo} is already paid — adjust allocations.`,
    };
  }
  if (err instanceof AllocationExceedsOutstandingError) {
    return {
      ok: false,
      message: `Allocation for installment #${err.sequenceNo} exceeds its outstanding balance.`,
    };
  }
  if (err instanceof AllocationDuplicateInstallmentError) {
    return {
      ok: false,
      message: 'An installment appears twice in the allocation list. Refresh and try again.',
    };
  }
  // Unknown error → log on server, re-throw so Next renders the error boundary.
  console.error('[recordPaymentAction] unexpected error', err);
  throw err;
}
