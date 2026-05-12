import { PrismaClient } from '@prisma/client';

const TENANT_SCOPED_MODELS = [
  'User',
  'Customer',
  'Property',
  'Plan',
  'Installment',
  'Payment',
  'PaymentAllocation',
] as const;

type ScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export class CrossTenantWriteError extends Error {
  constructor(model: string, attempted: string, expected: string) {
    super(
      `Cross-tenant write rejected on ${model}: caller scoped to tenantId=${expected} but write payload contained tenantId=${attempted}`,
    );
    this.name = 'CrossTenantWriteError';
  }
}

/**
 * Returns a Prisma client whose queries are auto-scoped to the given tenantId.
 *
 * - Reads on tenant-scoped models auto-inject { where: { tenantId } }.
 * - Writes auto-inject { data: { tenantId } } unless an explicit tenantId is
 *   provided. If an explicit tenantId is provided AND it differs from the
 *   caller's tenantId, the write is rejected with CrossTenantWriteError.
 *
 * Tenant table is excluded — operations on the Tenant table go through the raw
 * client (allow-listed paths only).
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scoped',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.includes(model as ScopedModel)) {
            return query(args);
          }
          const isRead = ['findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'].includes(operation);
          const isWrite = ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(operation);

          if (isRead) {
            const a = args as { where?: Record<string, unknown> };
            a.where = { ...(a.where ?? {}), tenantId };
            return query(a);
          }

          if (isWrite) {
            const a = args as {
              data?: Record<string, unknown> | Record<string, unknown>[];
              where?: Record<string, unknown>;
            };
            if (a.where) a.where = { ...a.where, tenantId };
            if (Array.isArray(a.data)) {
              a.data = a.data.map((row) => assertOrInjectTenantId(model, row, tenantId));
            } else if (a.data) {
              a.data = assertOrInjectTenantId(model, a.data, tenantId);
            }
            return query(a);
          }
          return query(args);
        },
      },
    },
  });
}

function assertOrInjectTenantId(
  model: string,
  data: Record<string, unknown>,
  expectedTenantId: string,
): Record<string, unknown> {
  if ('tenantId' in data && data.tenantId !== undefined) {
    if (data.tenantId !== expectedTenantId) {
      throw new CrossTenantWriteError(model, String(data.tenantId), expectedTenantId);
    }
    return data;
  }
  return { ...data, tenantId: expectedTenantId };
}

export type TenantPrismaClient = ReturnType<typeof forTenant>;
