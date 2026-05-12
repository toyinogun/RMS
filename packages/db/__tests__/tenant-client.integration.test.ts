import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { forTenant, CrossTenantWriteError } from '../src/tenant-client.js';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000001';
const TENANT_B = '01935b7e-0000-7000-8000-000000000002';

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'tenant-a', name: 'Tenant A' },
      { id: TENANT_B, slug: 'tenant-b', name: 'Tenant B' },
    ],
  });
});

afterAll(async () => {
  await pg?.stop();
});

describe('forTenant() — auto-scoped Prisma client', () => {
  test('create auto-injects tenantId', async () => {
    const db = forTenant(pg.prisma, TENANT_A);
    const created = await db.customer.create({
      data: { fullName: 'Adaeze Okafor', phone: '+2348012345001' },
    });
    expect(created.tenantId).toBe(TENANT_A);
  });

  test('findMany auto-scopes by tenantId — cross-tenant rows invisible', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    const dbB = forTenant(pg.prisma, TENANT_B);
    await dbB.customer.create({
      data: { fullName: 'Other Tenant Customer', phone: '+2348012345099' },
    });
    const aRows = await dbA.customer.findMany();
    expect(aRows.every((r) => r.tenantId === TENANT_A)).toBe(true);
    expect(aRows.some((r) => r.fullName === 'Other Tenant Customer')).toBe(false);
  });

  test('explicit cross-tenant write is rejected', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    await expect(
      dbA.customer.create({
        data: {
          tenantId: TENANT_B,
          fullName: 'Hostile Insert',
          phone: '+2348012345111',
        },
      }),
    ).rejects.toBeInstanceOf(CrossTenantWriteError);
  });

  test('explicit same-tenant write is allowed', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    const ok = await dbA.customer.create({
      data: {
        tenantId: TENANT_A,
        fullName: 'Same Tenant Explicit',
        phone: '+2348012345222',
      },
    });
    expect(ok.tenantId).toBe(TENANT_A);
  });
});
