import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  createPlan,
  cancelPlan,
  listPlans,
  getPlan,
  PlanNotFoundError,
  PlanHasPaymentsError,
  PropertyNotAvailableError,
  CustomerNotFoundError,
} from '../src/plans-service.js';
import { createProperty } from '../src/properties-service.js';
import { createCustomer } from '../src/customers-service.js';
import type { TenantContext } from '@solutio/shared/tenant';
import type { PlanCreateInput } from '@solutio/shared/installments';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0001-7000-8000-000000000001';
const TENANT_B = '01935b7e-0001-7000-8000-000000000002';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: '01935b7e-0001-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0001-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER',
    email: 'owner@plans-test',
    mustChangePassword: false,
  },
});

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

let propertyCodeSeq = 0;
const nextPropertyCode = (prefix: string) => `${prefix}-${(++propertyCodeSeq).toString().padStart(4, '0')}`;

const seedAvailableProperty = async (tenantId: string, prefix = 'PLN') => {
  const ctx = ctxFor(tenantId);
  return createProperty(ctx, {
    code: nextPropertyCode(prefix),
    title: 'Test Unit',
    addressLine: '1 Test St',
    city: 'Lagos',
    totalPriceKobo: 500_000_000n,
  });
};

const baseCreateInput = (overrides: Partial<PlanCreateInput> = {}): PlanCreateInput => ({
  customer: { mode: 'new', fullName: 'New Customer', phone: '+2348010000000' },
  propertyId: '00000000-0000-0000-0000-000000000000',
  totalPriceKobo: 500_000_000n,
  depositKobo: 50_000_000n,
  monthlyKobo: 20_000_000n,
  termMonths: 24,
  startDate: tomorrow(),
  depositReceived: false,
  ...overrides,
} as PlanCreateInput);

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'plans-tenant-a', name: 'A' },
      { id: TENANT_B, slug: 'plans-tenant-b', name: 'B' },
    ],
  });
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

describe('plans-service.createPlan', () => {
  test('creates DRAFT plan with new-customer payload and materializes installments', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(
      ctx,
      baseCreateInput({ propertyId: property.id }),
    );
    const plan = await pg.prisma.plan.findUnique({ where: { id }, include: { installments: true } });
    expect(plan).toBeTruthy();
    expect(plan!.status).toBe('DRAFT');
    expect(plan!.tenantId).toBe(TENANT_A);
    expect(plan!.createdBy).toBe(ctx.user.id);
    expect(plan!.installments).toHaveLength(25);
    expect(plan!.installments.find((i) => i.sequenceNo === 0)!.amountDueKobo).toBe(50_000_000n);
    // Property stays AVAILABLE in M3 (no auto-flip until M4 ACTIVE transition).
    const propAfter = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(propAfter!.status).toBe('AVAILABLE');
    // New customer was created inside the same transaction.
    const customerCount = await pg.prisma.customer.count({
      where: { tenantId: TENANT_A, fullName: 'New Customer' },
    });
    expect(customerCount).toBeGreaterThanOrEqual(1);
  });

  test('creates DRAFT plan with existing-customer payload', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await createCustomer(ctx, {
      fullName: 'Existing Cust',
      phone: '+2348010000111',
    });
    const { id } = await createPlan(
      ctx,
      baseCreateInput({
        propertyId: property.id,
        customer: { mode: 'existing', id: customer.id },
      }),
    );
    const plan = await pg.prisma.plan.findUnique({ where: { id } });
    expect(plan!.customerId).toBe(customer.id);
  });

  test('throws PropertyNotAvailableError when property is not AVAILABLE', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    await pg.prisma.property.update({
      where: { id: property.id },
      data: { status: 'RESERVED' },
    });
    await expect(
      createPlan(ctx, baseCreateInput({ propertyId: property.id })),
    ).rejects.toBeInstanceOf(PropertyNotAvailableError);
  });

  test('throws CustomerNotFoundError for soft-deleted customer id', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await createCustomer(ctx, {
      fullName: 'Will Be Deleted',
      phone: '+2348010000222',
    });
    await pg.prisma.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      createPlan(
        ctx,
        baseCreateInput({
          propertyId: property.id,
          customer: { mode: 'existing', id: customer.id },
        }),
      ),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  test('rolls back the transaction when property check fails (no orphan customer)', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    await pg.prisma.property.update({
      where: { id: property.id },
      data: { status: 'SOLD' },
    });
    const before = await pg.prisma.customer.count({
      where: { tenantId: TENANT_A, fullName: 'Rollback Test' },
    });
    await expect(
      createPlan(
        ctx,
        baseCreateInput({
          propertyId: property.id,
          customer: { mode: 'new', fullName: 'Rollback Test', phone: '+2348010000333' },
        }),
      ),
    ).rejects.toBeInstanceOf(PropertyNotAvailableError);
    const after = await pg.prisma.customer.count({
      where: { tenantId: TENANT_A, fullName: 'Rollback Test' },
    });
    expect(after).toBe(before);
  });

  test('cross-tenant property is invisible (treated as not available)', async () => {
    const propertyInB = await seedAvailableProperty(TENANT_B);
    const ctxA = ctxFor(TENANT_A);
    await expect(
      createPlan(ctxA, baseCreateInput({ propertyId: propertyInB.id })),
    ).rejects.toBeInstanceOf(PropertyNotAvailableError);
  });

  test('depositReceived: true records deposit + flips plan ACTIVE + property SOLD', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const input = baseCreateInput({
      propertyId: property.id,
      depositReceived: true,
      depositMethod: 'CASH',
      depositReference: 'TEL-001',
      depositNotes: 'walk-in',
    });
    const { id } = await createPlan(ctx, input);

    const plan = await pg.prisma.plan.findUnique({
      where: { id },
      include: { installments: { orderBy: { sequenceNo: 'asc' } } },
    });
    expect(plan!.status).toBe('ACTIVE');
    expect(plan!.installments[0]!.amountPaidKobo).toBe(50_000_000n);
    expect(plan!.installments[0]!.status).toBe('PAID');
    // Non-deposit rows untouched.
    expect(plan!.installments[1]!.amountPaidKobo).toBe(0n);
    expect(plan!.installments[1]!.status).toBe('PENDING');

    const propAfter = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(propAfter!.status).toBe('SOLD');

    const payments = await pg.prisma.payment.findMany({ where: { planId: id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountKobo).toBe(50_000_000n);
    expect(payments[0]!.method).toBe('CASH');
    expect(payments[0]!.reference).toBe('TEL-001');
    expect(payments[0]!.notes).toBe('walk-in');
    expect(payments[0]!.recordedBy).toBe(ctx.user.id);
    // depositPaidAt was omitted from the input — service defaults it to startDate.
    expect(payments[0]!.paidAt.toISOString().slice(0, 10)).toBe(
      input.startDate.toISOString().slice(0, 10),
    );

    const allocations = await pg.prisma.paymentAllocation.findMany({
      where: { paymentId: payments[0]!.id },
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.installmentId).toBe(plan!.installments[0]!.id);
    expect(allocations[0]!.amountKobo).toBe(50_000_000n);
  });

  test('depositReceived: true against non-AVAILABLE property rolls back everything', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    await pg.prisma.property.update({
      where: { id: property.id },
      data: { status: 'RESERVED' },
    });

    const customersBefore = await pg.prisma.customer.count({
      where: { tenantId: TENANT_A, fullName: 'Deposit Rollback' },
    });
    const plansBefore = await pg.prisma.plan.count({
      where: { tenantId: TENANT_A, propertyId: property.id },
    });
    const installmentsBefore = await pg.prisma.installment.count({
      where: { tenantId: TENANT_A, plan: { propertyId: property.id } },
    });
    const paymentsBefore = await pg.prisma.payment.count({
      where: { tenantId: TENANT_A, plan: { propertyId: property.id } },
    });

    await expect(
      createPlan(
        ctx,
        baseCreateInput({
          propertyId: property.id,
          customer: { mode: 'new', fullName: 'Deposit Rollback', phone: '+2348010099887' },
          depositReceived: true,
          depositMethod: 'CASH',
        }),
      ),
    ).rejects.toBeInstanceOf(PropertyNotAvailableError);

    expect(
      await pg.prisma.customer.count({
        where: { tenantId: TENANT_A, fullName: 'Deposit Rollback' },
      }),
    ).toBe(customersBefore);
    expect(
      await pg.prisma.plan.count({ where: { tenantId: TENANT_A, propertyId: property.id } }),
    ).toBe(plansBefore);
    expect(
      await pg.prisma.installment.count({
        where: { tenantId: TENANT_A, plan: { propertyId: property.id } },
      }),
    ).toBe(installmentsBefore);
    expect(
      await pg.prisma.payment.count({
        where: { tenantId: TENANT_A, plan: { propertyId: property.id } },
      }),
    ).toBe(paymentsBefore);
    expect(
      await pg.prisma.paymentAllocation.count({
        where: { tenantId: TENANT_A, payment: { plan: { propertyId: property.id } } },
      }),
    ).toBe(0);
  });
});

describe('plans-service.cancelPlan', () => {
  test('flips DRAFT plan to CANCELLED', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctx, baseCreateInput({ propertyId: property.id }));
    await cancelPlan(ctx, { id });
    const plan = await pg.prisma.plan.findUnique({ where: { id } });
    expect(plan!.status).toBe('CANCELLED');
  });

  test('is idempotent on already-CANCELLED plan', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctx, baseCreateInput({ propertyId: property.id }));
    await cancelPlan(ctx, { id });
    await expect(cancelPlan(ctx, { id })).resolves.toBeUndefined();
  });

  test('throws PlanNotFoundError for unknown id', async () => {
    const ctx = ctxFor(TENANT_A);
    await expect(
      cancelPlan(ctx, { id: '01935b7e-0001-7000-8000-ffffffffffff' }),
    ).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  test('throws PlanHasPaymentsError when any payment references the plan', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctx, baseCreateInput({ propertyId: property.id }));
    await pg.prisma.payment.create({
      data: {
        tenantId: TENANT_A,
        planId: id,
        amountKobo: 10_000n,
        paidAt: new Date(),
        method: 'CASH',
        recordedBy: ctx.user.id,
      },
    });
    await expect(cancelPlan(ctx, { id })).rejects.toBeInstanceOf(PlanHasPaymentsError);
  });

  test('cross-tenant cancel is invisible (treated as not found)', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctxA, baseCreateInput({ propertyId: property.id }));
    await expect(cancelPlan(ctxB, { id })).rejects.toBeInstanceOf(PlanNotFoundError);
  });
});

describe('plans-service.listPlans', () => {
  test('filters by status and excludes soft-deleted', async () => {
    const ctx = ctxFor(TENANT_A);
    const p1 = await seedAvailableProperty(TENANT_A);
    const p2 = await seedAvailableProperty(TENANT_A);
    const a = await createPlan(ctx, baseCreateInput({ propertyId: p1.id }));
    const b = await createPlan(ctx, baseCreateInput({ propertyId: p2.id }));
    await cancelPlan(ctx, { id: b.id });
    const drafts = await listPlans(ctx, { status: 'DRAFT', q: undefined });
    expect(drafts.some((p) => p.id === a.id)).toBe(true);
    expect(drafts.some((p) => p.id === b.id)).toBe(false);
    // Soft-delete a manually and verify it's excluded.
    await pg.prisma.plan.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    const after = await listPlans(ctx, { status: 'ALL', q: undefined });
    expect(after.some((p) => p.id === a.id)).toBe(false);
  });

  test('searches by customer name (case-insensitive) and property code (uppercased)', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A, 'SEARCH');
    await createPlan(
      ctx,
      baseCreateInput({
        propertyId: property.id,
        customer: { mode: 'new', fullName: 'Findable Person', phone: '+2348019999999' },
      }),
    );
    const byName = await listPlans(ctx, { status: 'ALL', q: 'findable' });
    expect(byName.some((p) => p.customer.fullName === 'Findable Person')).toBe(true);
    const byCode = await listPlans(ctx, { status: 'ALL', q: 'search-' });
    expect(byCode.length).toBeGreaterThanOrEqual(1);
  });
});

describe('plans-service.getPlan', () => {
  test('returns plan with installments ordered by sequenceNo', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctx, baseCreateInput({ propertyId: property.id }));
    const plan = await getPlan(ctx, id);
    expect(plan).toBeTruthy();
    expect(plan!.installments.length).toBe(25);
    for (let i = 0; i < plan!.installments.length - 1; i++) {
      expect(plan!.installments[i]!.sequenceNo).toBeLessThan(plan!.installments[i + 1]!.sequenceNo);
    }
  });

  test('returns null for cross-tenant id', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    const property = await seedAvailableProperty(TENANT_A);
    const { id } = await createPlan(ctxA, baseCreateInput({ propertyId: property.id }));
    expect(await getPlan(ctxB, id)).toBeNull();
  });
});
