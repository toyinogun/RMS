export { prisma } from './client';
export { forTenant, CrossTenantWriteError } from './tenant-client';
export type { TenantPrismaClient } from './tenant-client';
export { recordPayment } from './payments-service';
export type { RecordPaymentInput } from './payments-service';
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
