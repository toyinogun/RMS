/**
 * Shared user-facing strings for the payment-record flow.
 *
 * Lives outside `record.ts` because Next's `'use server'` modules may only
 * export async functions; exporting a const string from a server-action file
 * is a Turbopack build error.
 */
export const PAYMENT_RETRY_FAILURE_MESSAGE =
  'Could not record payment due to a concurrent update. Try again.';
