export { prisma } from './client';
export { forTenant, CrossTenantWriteError } from './tenant-client';
export type { TenantPrismaClient } from './tenant-client';
export {
  recordPayment,
  listPaymentsForPlan,
  reversePayment,
  PlanNotPayableError,
  PaymentBeforePlanStartError,
  PaymentOverpayError,
  AllocationInstallmentNotFoundError,
  AllocationAgainstPaidInstallmentError,
  AllocationDuplicateInstallmentError,
  AllocationExceedsOutstandingError,
  PaymentRetryableSerializationError,
  PaymentNotFoundError,
  PaymentAlreadyReversedError,
  CannotReverseReversalRowError,
} from './payments-service';
export type {
  PaymentRecordInput,
  RecordPaymentResult,
  PaymentListRow,
  ReversePaymentInput,
  ReversePaymentResult,
} from './payments-service';
export type * from '@prisma/client';
export {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  listCustomers,
  getCustomer,
  CustomerNotFoundError,
  CustomerHasPlansError,
} from './customers-service';
export {
  createProperty,
  updateProperty,
  setPropertyStatus,
  softDeleteProperty,
  listProperties,
  getProperty,
  PropertyNotFoundError,
  PropertyCodeConflictError,
  PropertyStatusChangeBlockedError,
  PropertyHasPlansError,
} from './properties-service';
export {
  createPlan,
  cancelPlan,
  listPlans,
  getPlan,
  PlanNotFoundError,
  PlanHasPaymentsError,
  PropertyNotAvailableError,
  PlanCreateRetryableSerializationError,
} from './plans-service';
export {
  listUsers,
  createUser,
  deactivateUser,
  reactivateUser,
  isAuthUserDeactivated,
  UserNotFoundError,
  EmailAlreadyInUseError,
  CannotCreateOwnerError,
  CannotDeactivateSelfError,
  CannotDeactivateLastOwnerError,
  UserAlreadyDeactivatedError,
  UserNotDeactivatedError,
  UserDeactivateRetryableSerializationError,
} from './users-service';
export type {
  UsersAuthAdapter,
  UserListRow,
} from './users-service';
