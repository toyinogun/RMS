export { prisma } from './client.js';
export { forTenant, CrossTenantWriteError } from './tenant-client.js';
export type { TenantPrismaClient } from './tenant-client.js';
export type * from '@prisma/client';
