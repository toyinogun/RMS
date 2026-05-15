/**
 * Shared plan-related error classes.
 *
 * Extracted out of `plans-service.ts` so that `payments-service.ts` can throw
 * `PlanNotFoundError` / `PropertyNotAvailableError` without creating an import
 * cycle (plans-service ↔ payments-service). Keep this module dependency-free
 * apart from the symbols Prisma generates — no service-layer imports here.
 */

export class PlanNotFoundError extends Error {
  static readonly code = 'PLAN_NOT_FOUND' as const;
  readonly code = PlanNotFoundError.code;
  constructor(id: string) {
    super(`Plan not found: ${id}`);
    this.name = 'PlanNotFoundError';
  }
}

export class PropertyNotAvailableError extends Error {
  static readonly code = 'PROPERTY_NOT_AVAILABLE' as const;
  readonly code = PropertyNotAvailableError.code;
  constructor(propertyId: string, currentStatus: string) {
    super(`Property ${propertyId} is not available (status: ${currentStatus})`);
    this.name = 'PropertyNotAvailableError';
  }
}

/** Thrown when a SERIALIZABLE serialization conflict aborts the transaction. */
export class PlanCreateRetryableSerializationError extends Error {
  static readonly code = 'PLAN_CREATE_RETRYABLE_SERIALIZATION' as const;
  readonly code = PlanCreateRetryableSerializationError.code;
  constructor() {
    super('Concurrent update aborted plan creation. Retry suggested.');
    this.name = 'PlanCreateRetryableSerializationError';
  }
}
