export { prisma } from './client.js';
export { forTenant, CrossTenantWriteError } from './tenant-client.js';
export type { TenantPrismaClient } from './tenant-client.js';
export { recordPayment } from './payments-service.js';
export type { RecordPaymentInput } from './payments-service.js';
export type * from '@prisma/client';
