import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import type { CustomerCreateInput, CustomerUpdateInput } from '@solutio/shared/customers';
import { forTenant } from './tenant-client';

export class CustomerNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer not found: ${id}`);
    this.name = 'CustomerNotFoundError';
  }
}

export class CustomerHasPlansError extends Error {
  constructor(id: string, planCount: number) {
    super(`Cannot delete customer ${id}: ${planCount} non-cancelled plan(s) reference it`);
    this.name = 'CustomerHasPlansError';
  }
}

export async function createCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: CustomerCreateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const data = {
    fullName: input.fullName,
    phone: input.phone,
    email: input.email ?? null,
    nationalId: input.nationalId ?? null,
    notes: input.notes ?? null,
    createdBy: ctx.user.id,
  } satisfies Omit<Prisma.CustomerUncheckedCreateInput, 'tenantId'>;
  return scoped.customer.create({ data: data as unknown as Prisma.CustomerUncheckedCreateInput });
}

export async function updateCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: CustomerUpdateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.customer.findUnique({ where: { id: input.id } });
  if (!existing || existing.deletedAt) throw new CustomerNotFoundError(input.id);
  return scoped.customer.update({
    where: { id: input.id },
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      nationalId: input.nationalId ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function softDeleteCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.customer.findUnique({
    where: { id },
    include: {
      plans: {
        where: { status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new CustomerNotFoundError(id);
  if (existing.plans.length > 0) {
    throw new CustomerHasPlansError(id, existing.plans.length);
  }
  return scoped.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function listCustomers(
  prisma: PrismaClient,
  ctx: TenantContext,
  opts: { search?: string; take?: number; cursor?: string } = {},
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const search = opts.search?.trim();
  return scoped.customer.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}

export async function getCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const row = await scoped.customer.findUnique({
    where: { id },
    include: {
      plans: {
        where: { deletedAt: null },
        select: { id: true, status: true, totalPriceKobo: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row || row.deletedAt) return null;
  return row;
}
