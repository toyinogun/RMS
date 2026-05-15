import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  listCustomers,
  getCustomer,
  CustomerNotFoundError,
  CustomerHasPlansError,
} from '../src/customers-service.js';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000001';
const TENANT_B = '01935b7e-0000-7000-8000-000000000002';

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
      { id: TENANT_A, slug: 'tenant-a', name: 'A' },
      { id: TENANT_B, slug: 'tenant-b', name: 'B' },
    ],
  });
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

describe('customers-service', () => {
  test('createCustomer auto-injects tenantId and createdBy', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(ctx, {
      fullName: 'Adaeze Okafor',
      phone: '+2348012345001',
    });
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.createdBy).toBe(ctx.user.id);
    expect(created.deletedAt).toBeNull();
  });

  test('updateCustomer changes fields but leaves tenantId untouched', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(ctx, {
      fullName: 'Original Name',
      phone: '+2348012345002',
    });
    const updated = await updateCustomer(ctx, {
      id: created.id,
      fullName: 'Renamed',
      phone: '+2348012345002',
      email: 'new@example.com',
    });
    expect(updated.fullName).toBe('Renamed');
    expect(updated.email).toBe('new@example.com');
    expect(updated.tenantId).toBe(TENANT_A);
  });

  test('updateCustomer throws CustomerNotFoundError for unknown id', async () => {
    const ctx = ctxFor(TENANT_A);
    await expect(
      updateCustomer(ctx, {
        id: '01935b7e-0000-7000-8000-ffffffffffff',
        fullName: 'X',
        phone: '+2348012345099',
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  test('cross-tenant update is invisible (treated as not found)', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    const inA = await createCustomer(ctxA, {
      fullName: 'Tenant A Customer',
      phone: '+2348012345003',
    });
    await expect(
      updateCustomer(ctxB, {
        id: inA.id,
        fullName: 'Hijack',
        phone: '+2348012345003',
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  test('softDeleteCustomer sets deletedAt and removes from listCustomers', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(ctx, {
      fullName: 'Will Be Deleted',
      phone: '+2348012345004',
    });
    await softDeleteCustomer(ctx, created.id);
    const list = await listCustomers(ctx);
    expect(list.some((c) => c.id === created.id)).toBe(false);
    const fetched = await getCustomer(ctx, created.id);
    expect(fetched).toBeNull();
  });

  test('softDeleteCustomer throws CustomerHasPlansError when active plans reference it', async () => {
    const ctx = ctxFor(TENANT_A);
    const customer = await createCustomer(ctx, {
      fullName: 'Has Plans',
      phone: '+2348012345005',
    });
    // Insert a Property + Plan directly via the unscoped prisma client.
    const property = await pg.prisma.property.create({
      data: {
        tenantId: TENANT_A,
        code: 'PLN-CHK-1',
        title: 'X',
        addressLine: 'X',
        city: 'X',
        totalPriceKobo: 100_000_00n,
      },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: property.id,
        totalPriceKobo: 100_000_00n,
        depositKobo: 0n,
        monthlyKobo: 100_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'ACTIVE',
      },
    });
    await expect(softDeleteCustomer(ctx, customer.id)).rejects.toBeInstanceOf(
      CustomerHasPlansError,
    );
  });

  test('listCustomers filters by case-insensitive name/phone/email search', async () => {
    const ctx = ctxFor(TENANT_A);
    await createCustomer(ctx, {
      fullName: 'Searchable Person',
      phone: '+2348011111111',
      email: 'search@example.com',
    });
    const byName = await listCustomers(ctx, { search: 'searchable' });
    const byPhone = await listCustomers(ctx, { search: '8011111111' });
    const byEmail = await listCustomers(ctx, { search: 'SEARCH@example' });
    expect(byName.some((c) => c.fullName === 'Searchable Person')).toBe(true);
    expect(byPhone.some((c) => c.fullName === 'Searchable Person')).toBe(true);
    expect(byEmail.some((c) => c.fullName === 'Searchable Person')).toBe(true);
  });

  test('listCustomers does not return tenant B rows', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createCustomer(ctxB, {
      fullName: 'Tenant B Only',
      phone: '+2348099999999',
    });
    const listA = await listCustomers(ctxA);
    expect(listA.some((c) => c.fullName === 'Tenant B Only')).toBe(false);
  });
});
