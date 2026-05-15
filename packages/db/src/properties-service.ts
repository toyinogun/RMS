import { Prisma } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import type {
  PropertyCreateInput,
  PropertyUpdateInput,
  PropertyStatusInput,
} from '@solutio/shared/properties';
import { forTenant } from './tenant-client';
import { prisma } from './client';

export class PropertyNotFoundError extends Error {
  constructor(id: string) {
    super(`Property not found: ${id}`);
    this.name = 'PropertyNotFoundError';
  }
}

export class PropertyCodeConflictError extends Error {
  constructor(code: string) {
    super(`Property code already in use: ${code}`);
    this.name = 'PropertyCodeConflictError';
  }
}

export class PropertyStatusChangeBlockedError extends Error {
  constructor(id: string, reason: string) {
    super(`Cannot change status of property ${id}: ${reason}`);
    this.name = 'PropertyStatusChangeBlockedError';
  }
}

export class PropertyHasPlansError extends Error {
  constructor(id: string, planCount: number) {
    super(`Cannot delete property ${id}: ${planCount} non-cancelled plan(s) reference it`);
    this.name = 'PropertyHasPlansError';
  }
}

function isUniqueConstraintError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function createProperty(
  ctx: TenantContext,
  input: PropertyCreateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const data = {
    code: input.code,
    title: input.title,
    addressLine: input.addressLine,
    city: input.city,
    totalPriceKobo: input.totalPriceKobo,
    createdBy: ctx.user.id,
  } satisfies Omit<Prisma.PropertyUncheckedCreateInput, 'tenantId'>;
  try {
    return await scoped.property.create({ data: data as unknown as Prisma.PropertyUncheckedCreateInput });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new PropertyCodeConflictError(input.code);
    throw err;
  }
}

export async function updateProperty(
  ctx: TenantContext,
  input: PropertyUpdateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({ where: { id: input.id } });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(input.id);
  try {
    return await scoped.property.update({
      where: { id: input.id },
      data: {
        code: input.code,
        title: input.title,
        addressLine: input.addressLine,
        city: input.city,
        totalPriceKobo: input.totalPriceKobo,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new PropertyCodeConflictError(input.code);
    throw err;
  }
}

export async function setPropertyStatus(
  ctx: TenantContext,
  input: { id: string; status: PropertyStatusInput },
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({
    where: { id: input.id },
    include: {
      plans: {
        where: { status: { in: ['ACTIVE', 'DRAFT', 'COMPLETED', 'DEFAULTED'] }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(input.id);
  if (existing.status === 'SOLD') {
    throw new PropertyStatusChangeBlockedError(
      input.id,
      'property is SOLD; manual status changes are blocked once a plan is ACTIVE',
    );
  }
  if (existing.plans.length > 0 && input.status !== existing.status) {
    throw new PropertyStatusChangeBlockedError(
      input.id,
      'a non-cancelled plan references this property',
    );
  }
  return scoped.property.update({
    where: { id: input.id },
    data: { status: input.status },
  });
}

export async function softDeleteProperty(
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({
    where: { id },
    include: {
      plans: {
        where: { status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(id);
  if (existing.plans.length > 0) {
    throw new PropertyHasPlansError(id, existing.plans.length);
  }
  return scoped.property.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function listProperties(
  ctx: TenantContext,
  opts: {
    status?: 'AVAILABLE' | 'RESERVED' | 'SOLD';
    search?: string;
    take?: number;
    cursor?: string;
  } = {},
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const search = opts.search?.trim();
  return scoped.property.findMany({
    where: {
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search.toUpperCase() } },
              { title: { contains: search, mode: 'insensitive' } },
              { addressLine: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: opts.take ?? 50,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}

export async function getProperty(
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const row = await scoped.property.findUnique({
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
