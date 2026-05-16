import type { Kobo } from '../money/index';
import type { Allocation } from './types';

/**
 * The output of `reverse()` — a negated mirror of the original payment's
 * amount and allocation breakdown. All values are negative.
 * Caller persists this as a reversal payment inside a DB transaction.
 */
export type ReversalPlan = {
  /** Negative — exact negation of the original payment's amountKobo. */
  amountKobo: Kobo;
  /** Negative — exact negation of each corresponding original allocation. */
  allocations: ReadonlyArray<Allocation>;
};

/**
 * Error thrown when `reverse()` receives input that violates an invariant.
 * These are programmer errors (bad data in DB or incorrect call-site logic),
 * not recoverable user-input errors — so we throw, not return a Result.
 */
export class ReversalInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReversalInvariantError';
  }
}

/**
 * Pure function — produces a `ReversalPlan` that exactly negates the original
 * payment amount and every individual allocation. No side effects.
 *
 * @throws {ReversalInvariantError} if any invariant on the input is violated.
 */
export function reverse(original: {
  amountKobo: Kobo;
  allocations: ReadonlyArray<Allocation>;
}): ReversalPlan {
  if (original.amountKobo <= 0n) {
    throw new ReversalInvariantError('amountKobo must be positive');
  }

  if (original.allocations.length === 0) {
    throw new ReversalInvariantError('allocations must be non-empty');
  }

  let sum = 0n;
  for (const alloc of original.allocations) {
    if (alloc.amountKobo <= 0n) {
      throw new ReversalInvariantError(
        `allocation amountKobo must be positive (got ${alloc.amountKobo} for installment ${alloc.installmentId})`,
      );
    }
    sum += alloc.amountKobo;
  }

  if (sum !== original.amountKobo) {
    throw new ReversalInvariantError(
      `allocations sum (${sum}) does not equal amountKobo (${original.amountKobo})`,
    );
  }

  return {
    amountKobo: (-original.amountKobo) as Kobo,
    allocations: original.allocations.map((alloc) => ({
      installmentId: alloc.installmentId,
      amountKobo: (-alloc.amountKobo) as Kobo,
    })),
  };
}
