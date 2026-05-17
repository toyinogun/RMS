'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { paymentReversalSchema } from '@solutio/shared/payments';
import {
  reversePayment,
  PaymentNotFoundError,
  PaymentAlreadyReversedError,
  CannotReverseReversalRowError,
  PaymentRetryableSerializationError,
} from '@solutio/db/payments-service';
import type { ReversePaymentResult } from '@solutio/db/payments-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole, ForbiddenError } from '@solutio/shared/tenant';
import {
  REVERSAL_RETRY_FAILURE_MESSAGE,
  REVERSAL_FORBIDDEN_MESSAGE,
  REVERSAL_NOT_FOUND_MESSAGE,
  REVERSAL_ALREADY_REVERSED_MESSAGE,
  REVERSAL_CANNOT_REVERSE_REVERSAL_MESSAGE,
} from './messages';

// Reuse the service's PlanStatus shape without importing @prisma/client into
// apps/web — keeps the bundler off the generated Prisma runtime.
type PlanStatus = ReversePaymentResult['planStatus'];

export type ReversePaymentErrorCode =
  | 'M5_FORBIDDEN'
  | 'M5_INVALID_INPUT'
  | 'M5_NOT_FOUND'
  | 'M5_CANNOT_REVERSE_REVERSAL'
  | 'M5_ALREADY_REVERSED'
  | 'M5_TRY_AGAIN';

export type PaymentReverseState =
  | { ok: true; reversalPaymentId: string; planStatus: PlanStatus }
  | { ok: false; code: ReversePaymentErrorCode; message: string };

/**
 * Schema that validates both the reversal payload and the planId required
 * for path revalidation. The planId is provided via a hidden input in the
 * reversal dialog (Task 5) and is validated here as a UUID.
 */
const actionInputSchema = paymentReversalSchema.extend({
  planId: z.string().uuid({ message: 'Invalid plan id' }),
});

export async function reversePaymentAction(
  _prevState: PaymentReverseState | undefined,
  formData: FormData,
): Promise<PaymentReverseState> {
  const ctx = await getTenantContext();
  if (!ctx || !hasRole(ctx, ['OWNER', 'ADMIN'])) {
    return { ok: false, code: 'M5_FORBIDDEN', message: REVERSAL_FORBIDDEN_MESSAGE };
  }

  const parsed = actionInputSchema.safeParse({
    paymentId: formData.get('paymentId')?.toString() ?? '',
    planId: formData.get('planId')?.toString() ?? '',
    reason: formData.get('reason')?.toString() ?? undefined,
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      code: 'M5_INVALID_INPUT',
      message: firstIssue?.message ?? 'Invalid input',
    };
  }

  const serviceInput = {
    paymentId: parsed.data.paymentId,
    notes: parsed.data.reason,
  };

  // Retry-once on SERIALIZABLE serialization conflict surfaced as
  // PaymentRetryableSerializationError. After the first loser re-snapshots
  // the payment rows, a second concurrent loser on the exact retry window is
  // unlikely. Any other thrown error short-circuits through error mapping.
  let result: ReversePaymentResult;
  try {
    result = await reversePayment(ctx, serviceInput);
  } catch (err) {
    if (err instanceof PaymentRetryableSerializationError) {
      try {
        result = await reversePayment(ctx, serviceInput);
      } catch (retryErr) {
        if (retryErr instanceof PaymentRetryableSerializationError) {
          return { ok: false, code: 'M5_TRY_AGAIN', message: REVERSAL_RETRY_FAILURE_MESSAGE };
        }
        return mapReversePaymentError(retryErr);
      }
    } else {
      return mapReversePaymentError(err);
    }
  }

  revalidatePath(`/plans/${parsed.data.planId}`);
  revalidatePath('/');
  return { ok: true, reversalPaymentId: result.reversalPaymentId, planStatus: result.planStatus };
}

function mapReversePaymentError(err: unknown): PaymentReverseState {
  if (err instanceof ForbiddenError) {
    return { ok: false, code: 'M5_FORBIDDEN', message: REVERSAL_FORBIDDEN_MESSAGE };
  }
  if (err instanceof PaymentNotFoundError) {
    return { ok: false, code: 'M5_NOT_FOUND', message: REVERSAL_NOT_FOUND_MESSAGE };
  }
  if (err instanceof CannotReverseReversalRowError) {
    return {
      ok: false,
      code: 'M5_CANNOT_REVERSE_REVERSAL',
      message: REVERSAL_CANNOT_REVERSE_REVERSAL_MESSAGE,
    };
  }
  if (err instanceof PaymentAlreadyReversedError) {
    return { ok: false, code: 'M5_ALREADY_REVERSED', message: REVERSAL_ALREADY_REVERSED_MESSAGE };
  }
  // Unknown error → log on server, re-throw so Next renders the error boundary.
  console.error('[reversePaymentAction] unexpected error', err);
  throw err;
}
