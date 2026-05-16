/**
 * Shared user-facing strings for the payment-record and payment-reversal flows.
 *
 * Lives outside `record.ts` / `reverse.ts` because Next's `'use server'` modules
 * may only export async functions; exporting a const string from a server-action
 * file is a Turbopack build error.
 */
export const PAYMENT_RETRY_FAILURE_MESSAGE =
  'Could not record payment due to a concurrent update. Try again.';

export const REVERSAL_RETRY_FAILURE_MESSAGE =
  'Could not reverse payment due to a concurrent update. Try again.';

export const REVERSAL_FORBIDDEN_MESSAGE =
  'Only owners and admins can reverse payments.';

export const REVERSAL_NOT_FOUND_MESSAGE = 'Payment not found.';

export const REVERSAL_ALREADY_REVERSED_MESSAGE =
  'This payment has already been reversed.';

export const REVERSAL_CANNOT_REVERSE_REVERSAL_MESSAGE =
  'A reversal payment cannot itself be reversed.';
