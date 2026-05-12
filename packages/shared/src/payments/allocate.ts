import type { Kobo } from '../money/index.js';
import type { AllocationResult, InstallmentRow } from './types.js';

/**
 * Pure function — allocates a positive payment amount across installments
 * in sequence order. Caller persists allocations inside a DB transaction.
 *
 * Reversal payments (amountKobo < 0) use a separate flow — not this function.
 */
export function allocatePayment(amountKobo: Kobo, installments: InstallmentRow[]): AllocationResult {
  if (amountKobo === 0n) throw new Error('amountKobo must be non-zero');
  if (amountKobo < 0n) throw new Error('amountKobo cannot be negative — use the reversal flow');

  const sorted = [...installments].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const allocations: AllocationResult['allocations'] = [];
  let remaining = amountKobo;

  for (const inst of sorted) {
    if (remaining === 0n) break;
    const outstanding = inst.amountDueKobo - inst.amountPaidKobo;
    if (outstanding <= 0n) continue;
    const credit = (remaining < outstanding ? remaining : outstanding) as Kobo;
    allocations.push({ installmentId: inst.id, amountKobo: credit });
    remaining = (remaining - credit) as Kobo;
  }

  return { allocations, remainderKobo: remaining as Kobo };
}
