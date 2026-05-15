import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  recordPayment,
  PlanNotPayableError,
  PaymentBeforePlanStartError,
  PaymentOverpayError,
  AllocationInstallmentNotFoundError,
  AllocationAgainstPaidInstallmentError,
  AllocationExceedsOutstandingError,
  PaymentRetryableSerializationError,
} from '../src/payments-service.js';
import { createPlan, getPlan, PropertyNotAvailableError } from '../src/plans-service.js';
import { createProperty } from '../src/properties-service.js';
import { createCustomer } from '../src/customers-service.js';
import type { TenantContext } from '@solutio/shared/tenant';
import type { Kobo } from '@solutio/shared/money';
import type { PaymentRecordInput } from '@solutio/shared/payments';
import type { PlanCreateInput } from '@solutio/shared/installments';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0002-7000-8000-000000000001';

const USER_ID = '01935b7e-0002-7000-8000-aaaaaaaaaaaa';
const AUTH_USER_ID = '01935b7e-0002-7000-8000-bbbbbbbbbbbb';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: USER_ID,
    authUserId: AUTH_USER_ID,
    role: 'OWNER',
    email: 'owner@payments-test',
    mustChangePassword: false,
  },
});

const fixedStart = () => new Date('2026-06-01T00:00:00Z');
const onStartDay = () => new Date('2026-06-01T10:00:00Z');

let propertyCodeSeq = 0;
const nextPropertyCode = (prefix = 'PAY') =>
  `${prefix}-${(++propertyCodeSeq).toString().padStart(5, '0')}`;

const seedAvailableProperty = async (tenantId: string) => {
  const ctx = ctxFor(tenantId);
  return createProperty(ctx, {
    code: nextPropertyCode(),
    title: 'Test Unit',
    addressLine: '1 Test St',
    city: 'Lagos',
    totalPriceKobo: 12_000_000_00n, // 12M NGN in kobo
  });
};

const seedCustomer = async (tenantId: string, fullName = 'Buyer One') => {
  const ctx = ctxFor(tenantId);
  let phoneSuffix = 0;
  const phone = `+23480${(Date.now() % 100000000)
    .toString()
    .padStart(8, '0')}${phoneSuffix++}`.slice(0, 14);
  return createCustomer(ctx, { fullName, phone });
};

type SeedPlanOverrides = Partial<PlanCreateInput>;

const baseCreateInput = (
  propertyId: string,
  customerId: string,
  overrides: SeedPlanOverrides = {},
): PlanCreateInput =>
  ({
    customer: { mode: 'existing', id: customerId },
    propertyId,
    totalPriceKobo: 12_000_000_00n,
    depositKobo: 2_400_000_00n, // 2.4M
    monthlyKobo: 800_000_00n, // 800k × 12 = 9.6M
    termMonths: 12,
    startDate: fixedStart(),
    depositReceived: false,
    ...overrides,
  } as PlanCreateInput);

const seedDraftPlan = async (
  ctx: TenantContext,
  propertyId: string,
  customerId: string,
  overrides: SeedPlanOverrides = {},
) => {
  const { id } = await createPlan(ctx, baseCreateInput(propertyId, customerId, overrides));
  return id;
};

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.create({
    data: { id: TENANT_A, slug: 'payments-tenant-a', name: 'A' },
  });
  await pg.prisma.user.create({
    data: {
      id: USER_ID,
      tenantId: TENANT_A,
      authUserId: AUTH_USER_ID,
      email: 'owner@payments-test',
      name: 'Owner',
      role: 'OWNER',
    },
  });
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

describe('recordPayment — FIFO happy paths', () => {
  test('DRAFT plan + first payment = deposit → plan ACTIVE, property SOLD, inst[0] PAID', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    const result = await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    expect(result.planStatus).toBe('ACTIVE');
    expect(result.remainderKobo).toBe(0n);

    const plan = await getPlan(ctx, planId);
    expect(plan!.status).toBe('ACTIVE');
    expect(plan!.installments[0]!.status).toBe('PAID');
    expect(plan!.installments[0]!.amountPaidKobo).toBe(2_400_000_00n);
    expect(plan!.installments.slice(1).every((i) => i.status === 'PENDING')).toBe(true);

    const prop = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(prop!.status).toBe('SOLD');
  });

  test('ACTIVE plan + exact installment amount flips that one to PAID, plan stays ACTIVE', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // First payment activates the plan + pays deposit.
    await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    // Second payment exactly covers monthly #1.
    const result = await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'CASH',
    });
    expect(result.planStatus).toBe('ACTIVE');

    const plan = await getPlan(ctx, planId);
    expect(plan!.status).toBe('ACTIVE');
    expect(plan!.installments[0]!.status).toBe('PAID');
    expect(plan!.installments[1]!.status).toBe('PAID');
    expect(plan!.installments[2]!.status).toBe('PENDING');

    // Property remains SOLD (idempotent: second payment didn't re-flip).
    const prop = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(prop!.status).toBe('SOLD');
  });

  test('FIFO lump sum across 2.5 installments → 2 PAID, 1 PARTIAL', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // deposit (2.4M) + monthly1 (800k) + 400k toward monthly2 = 3,600,000_00 kobo
    await recordPayment(ctx, {
      planId,
      amountKobo: 3_600_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    const plan = await getPlan(ctx, planId);
    expect(plan!.status).toBe('ACTIVE');
    expect(plan!.installments[0]!.status).toBe('PAID');
    expect(plan!.installments[1]!.status).toBe('PAID');
    expect(plan!.installments[2]!.status).toBe('PARTIAL');
    expect(plan!.installments[2]!.amountPaidKobo).toBe(400_000_00n);
  });

  test('FIFO completion: final payment clears schedule → plan COMPLETED', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Pay the entire plan in one shot (12M).
    const result = await recordPayment(ctx, {
      planId,
      amountKobo: 12_000_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });
    expect(result.planStatus).toBe('COMPLETED');

    const plan = await getPlan(ctx, planId);
    expect(plan!.status).toBe('COMPLETED');
    expect(plan!.installments.every((i) => i.status === 'PAID')).toBe(true);

    const prop = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(prop!.status).toBe('SOLD');
  });
});

describe('recordPayment — manual override', () => {
  test('skip installment 1, pay installment 3 explicitly → only inst3 PAID; inst1 still PENDING', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Activate the plan first (DRAFT→ACTIVE) by paying the deposit.
    await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    const plan = await getPlan(ctx, planId);
    const inst3 = plan!.installments.find((i) => i.sequenceNo === 3)!;

    // Manually allocate against installment #3 only — skip #1 and #2.
    const result = await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'CASH',
      allocations: [{ installmentId: inst3.id, amountKobo: 800_000_00n as Kobo }],
    } as PaymentRecordInput);

    expect(result.planStatus).toBe('ACTIVE');

    const after = await getPlan(ctx, planId);
    expect(after!.installments.find((i) => i.sequenceNo === 1)!.status).toBe('PENDING');
    expect(after!.installments.find((i) => i.sequenceNo === 2)!.status).toBe('PENDING');
    expect(after!.installments.find((i) => i.sequenceNo === 3)!.status).toBe('PAID');
  });
});

describe('recordPayment — rejection paths', () => {
  test('PaymentOverpayError when FIFO amount exceeds total outstanding', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    try {
      await recordPayment(ctx, {
        planId,
        amountKobo: 15_000_000_00n as Kobo, // 3M more than total
        paidAt: onStartDay(),
        method: 'CASH',
      });
      throw new Error('Expected PaymentOverpayError');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentOverpayError);
      expect((err as PaymentOverpayError).overpayKobo).toBe(3_000_000_00n);
    }

    // No payment row should be persisted (transaction rolled back).
    const count = await pg.prisma.payment.count({ where: { planId } });
    expect(count).toBe(0);
  });

  test('PlanNotPayableError when plan is CANCELLED; no payment row written', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Force CANCELLED status directly via raw client.
    await pg.prisma.plan.update({ where: { id: planId }, data: { status: 'CANCELLED' } });

    await expect(
      recordPayment(ctx, {
        planId,
        amountKobo: 2_400_000_00n as Kobo,
        paidAt: onStartDay(),
        method: 'CASH',
      }),
    ).rejects.toBeInstanceOf(PlanNotPayableError);

    const count = await pg.prisma.payment.count({ where: { planId } });
    expect(count).toBe(0);
  });

  test('PaymentBeforePlanStartError when paidAt is earlier than startDate', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    await expect(
      recordPayment(ctx, {
        planId,
        amountKobo: 2_400_000_00n as Kobo,
        paidAt: new Date('2026-05-31T00:00:00Z'), // one day before start
        method: 'CASH',
      }),
    ).rejects.toBeInstanceOf(PaymentBeforePlanStartError);
  });

  test('AllocationInstallmentNotFoundError when alloc references a different plan', async () => {
    const ctx = ctxFor(TENANT_A);
    const propertyA = await seedAvailableProperty(TENANT_A);
    const propertyB = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planA = await seedDraftPlan(ctx, propertyA.id, customer.id);
    const planB = await seedDraftPlan(ctx, propertyB.id, customer.id);

    const planBData = await getPlan(ctx, planB);
    const foreignInstallmentId = planBData!.installments[0]!.id;

    await expect(
      recordPayment(ctx, {
        planId: planA,
        amountKobo: 2_400_000_00n as Kobo,
        paidAt: onStartDay(),
        method: 'CASH',
        allocations: [
          { installmentId: foreignInstallmentId, amountKobo: 2_400_000_00n as Kobo },
        ],
      } as PaymentRecordInput),
    ).rejects.toBeInstanceOf(AllocationInstallmentNotFoundError);
  });

  test('AllocationAgainstPaidInstallmentError when targeting an already-PAID installment', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Pay deposit in full first.
    await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });
    const plan = await getPlan(ctx, planId);
    const paidInst = plan!.installments[0]!; // deposit, now PAID

    await expect(
      recordPayment(ctx, {
        planId,
        amountKobo: 100_00n as Kobo,
        paidAt: onStartDay(),
        method: 'CASH',
        allocations: [{ installmentId: paidInst.id, amountKobo: 100_00n as Kobo }],
      } as PaymentRecordInput),
    ).rejects.toBeInstanceOf(AllocationAgainstPaidInstallmentError);
  });

  test('AllocationExceedsOutstandingError when alloc row > outstanding', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    const plan = await getPlan(ctx, planId);
    const monthly1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    // monthly1 is due 800k; attempting to allocate 900k overshoots.
    await expect(
      recordPayment(ctx, {
        planId,
        amountKobo: 900_000_00n as Kobo,
        paidAt: onStartDay(),
        method: 'CASH',
        allocations: [{ installmentId: monthly1.id, amountKobo: 900_000_00n as Kobo }],
      } as PaymentRecordInput),
    ).rejects.toBeInstanceOf(AllocationExceedsOutstandingError);
  });
});

describe('recordPayment — property race (SERIALIZABLE)', () => {
  test('two parallel first-payments on the same property: exactly one wins', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    // Seed plan A normally. For plan B, we have to bypass the createPlan
    // property guard (which would reject a second DRAFT on the same property
    // once A is created). Two DRAFTs on the same AVAILABLE property is the
    // exact pre-race state we want to test.
    const planAId = await seedDraftPlan(ctx, property.id, customer.id);
    // Move property back to AVAILABLE so we can seed plan B against it too.
    await pg.prisma.property.update({
      where: { id: property.id },
      data: { status: 'AVAILABLE' },
    });
    const planBId = await seedDraftPlan(ctx, property.id, customer.id);

    const payload = (planId: string): PaymentRecordInput =>
      ({
        planId,
        amountKobo: 2_400_000_00n as Kobo,
        paidAt: onStartDay(),
        method: 'TRANSFER',
      } as PaymentRecordInput);

    const results = await Promise.allSettled([
      recordPayment(ctx, payload(planAId)),
      recordPayment(ctx, payload(planBId)),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser's error can be either retryable-serialization or property-not-available
    // depending on whether Postgres' SERIALIZABLE catches the conflict.
    const loserErr = (rejected[0] as PromiseRejectedResult).reason;
    const isExpected =
      loserErr instanceof PaymentRetryableSerializationError ||
      loserErr instanceof PropertyNotAvailableError;
    expect(isExpected).toBe(true);

    // Final state: exactly one plan ACTIVE, the other still DRAFT, property SOLD.
    const planA = await pg.prisma.plan.findUnique({ where: { id: planAId } });
    const planB = await pg.prisma.plan.findUnique({ where: { id: planBId } });
    const statuses = [planA!.status, planB!.status].sort();
    expect(statuses).toEqual(['ACTIVE', 'DRAFT']);
    const prop = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(prop!.status).toBe('SOLD');
  });
});
