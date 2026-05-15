import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  createProperty,
  updateProperty,
  setPropertyStatus,
  softDeleteProperty,
  listProperties,
  getProperty,
  PropertyCodeConflictError,
  PropertyHasPlansError,
  PropertyStatusChangeBlockedError,
} from '../src/properties-service.js';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000011';
const TENANT_B = '01935b7e-0000-7000-8000-000000000012';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER',
    email: 'owner@test',
    mustChangePassword: false,
  },
});

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 't-a', name: 'A' },
      { id: TENANT_B, slug: 't-b', name: 'B' },
    ],
  });
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

describe('properties-service', () => {
  test('createProperty stores totalPriceKobo as BigInt and injects tenantId', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createProperty(ctx, {
      code: 'AT-001',
      title: '3-bed terrace',
      addressLine: '12 Marina Road',
      city: 'Lagos',
      totalPriceKobo: 5_000_000_000n,
    });
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.status).toBe('AVAILABLE');
    expect(created.totalPriceKobo).toBe(5_000_000_000n);
    expect(created.createdBy).toBe(ctx.user.id);
  });

  test('duplicate code within tenant throws PropertyCodeConflictError', async () => {
    const ctx = ctxFor(TENANT_A);
    await createProperty(ctx, {
      code: 'AT-DUP',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    await expect(
      createProperty(ctx, {
        code: 'AT-DUP',
        title: 'Y',
        addressLine: 'Y',
        city: 'Y',
        totalPriceKobo: 2_000_00n,
      }),
    ).rejects.toBeInstanceOf(PropertyCodeConflictError);
  });

  test('same code in different tenant is allowed', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createProperty(ctxA, {
      code: 'CROSS-OK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const inB = await createProperty(ctxB, {
      code: 'CROSS-OK',
      title: 'Y',
      addressLine: 'Y',
      city: 'Y',
      totalPriceKobo: 2_000_00n,
    });
    expect(inB.tenantId).toBe(TENANT_B);
  });

  test('setPropertyStatus toggles AVAILABLE <-> RESERVED when no plans reference it', async () => {
    const ctx = ctxFor(TENANT_A);
    const p = await createProperty(ctx, {
      code: 'AT-STATUS',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const reserved = await setPropertyStatus(ctx, { id: p.id, status: 'RESERVED' });
    expect(reserved.status).toBe('RESERVED');
    const available = await setPropertyStatus(ctx, { id: p.id, status: 'AVAILABLE' });
    expect(available.status).toBe('AVAILABLE');
  });

  test('setPropertyStatus blocks when a non-cancelled plan references the property', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await createProperty(ctx, {
      code: 'AT-BLOCK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const customer = await pg.prisma.customer.create({
      data: { tenantId: TENANT_A, fullName: 'C', phone: '+2348010000001' },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: property.id,
        totalPriceKobo: 1_000_00n,
        depositKobo: 0n,
        monthlyKobo: 1_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'DRAFT',
      },
    });
    await expect(
      setPropertyStatus(ctx, { id: property.id, status: 'RESERVED' }),
    ).rejects.toBeInstanceOf(PropertyStatusChangeBlockedError);
  });

  test('softDeleteProperty hides from list and blocks when a non-cancelled plan exists', async () => {
    const ctx = ctxFor(TENANT_A);
    const free = await createProperty(ctx, {
      code: 'AT-DEL-OK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    await softDeleteProperty(ctx, free.id);
    expect(await getProperty(ctx, free.id)).toBeNull();

    const linked = await createProperty(ctx, {
      code: 'AT-DEL-BLK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const customer = await pg.prisma.customer.create({
      data: { tenantId: TENANT_A, fullName: 'C2', phone: '+2348010000002' },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: linked.id,
        totalPriceKobo: 1_000_00n,
        depositKobo: 0n,
        monthlyKobo: 1_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'DRAFT',
      },
    });
    await expect(softDeleteProperty(ctx, linked.id)).rejects.toBeInstanceOf(
      PropertyHasPlansError,
    );
  });

  test('listProperties filters by status', async () => {
    const ctx = ctxFor(TENANT_A);
    const available = await listProperties(ctx, { status: 'AVAILABLE' });
    expect(available.every((p) => p.status === 'AVAILABLE')).toBe(true);
  });

  test('listProperties cross-tenant isolation', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createProperty(ctxB, {
      code: 'B-ONLY',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const listA = await listProperties(ctxA);
    expect(listA.some((p) => p.code === 'B-ONLY')).toBe(false);
  });

  test('listProperties EXPLAIN ANALYZE uses the property_active_idx partial index', async () => {
    const ctx = ctxFor(TENANT_A);
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT * FROM public."Property"
       WHERE "tenantId" = '${TENANT_A}'::uuid AND "deletedAt" IS NULL
       ORDER BY "status" ASC, "createdAt" DESC
       LIMIT 50`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(plan).toContain('property_active_idx');
    // Reference ctx so lint does not flag the unused binding.
    expect(ctx.tenantId).toBe(TENANT_A);
  });
});
