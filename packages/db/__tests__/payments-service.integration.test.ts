import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  recordPayment,
  listPaymentsForPlan,
  reversePayment,
  PlanNotPayableError,
  PaymentBeforePlanStartError,
  PaymentOverpayError,
  AllocationInstallmentNotFoundError,
  AllocationAgainstPaidInstallmentError,
  AllocationDuplicateInstallmentError,
  AllocationExceedsOutstandingError,
  PaymentRetryableSerializationError,
  PaymentNotFoundError,
  PaymentAlreadyReversedError,
  CannotReverseReversalRowError,
} from '../src/payments-service.js';
import { ForbiddenError } from '@solutio/shared/tenant';
import { createPlan, getPlan } from '../src/plans-service.js';
import { createProperty } from '../src/properties-service.js';
import { createCustomer } from '../src/customers-service.js';
import type { TenantContext } from '@solutio/shared/tenant';
import type { Kobo } from '@solutio/shared/money';
import type { PaymentRecordInput } from '@solutio/shared/payments';
import type { PlanCreateInput } from '@solutio/shared/installments';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0002-7000-8000-000000000001';
const TENANT_B = '01935b7e-0002-7000-8000-000000000002';

const USER_ID = '01935b7e-0002-7000-8000-aaaaaaaaaaaa';
const AUTH_USER_ID = '01935b7e-0002-7000-8000-bbbbbbbbbbbb';
const USER_ID_B = '01935b7e-0002-7000-8000-cccccccccccc';
const AUTH_USER_ID_B = '01935b7e-0002-7000-8000-dddddddddddd';

const ctxFor = (tenantId: string): TenantContext => {
  const isB = tenantId === TENANT_B;
  return {
    tenantId,
    user: {
      id: isB ? USER_ID_B : USER_ID,
      authUserId: isB ? AUTH_USER_ID_B : AUTH_USER_ID,
      role: 'OWNER',
      email: isB ? 'owner@payments-test-b' : 'owner@payments-test',
      mustChangePassword: false,
    },
  };
};

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
  const phone = `+23480${(Date.now() % 100000000).toString().padStart(8, '0')}`.slice(
    0,
    14,
  );
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
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'payments-tenant-a', name: 'A' },
      { id: TENANT_B, slug: 'payments-tenant-b', name: 'B' },
    ],
  });
  await pg.prisma.user.createMany({
    data: [
      {
        id: USER_ID,
        tenantId: TENANT_A,
        authUserId: AUTH_USER_ID,
        email: 'owner@payments-test',
        name: 'Owner A',
        role: 'OWNER',
      },
      {
        id: USER_ID_B,
        tenantId: TENANT_B,
        authUserId: AUTH_USER_ID_B,
        email: 'owner@payments-test-b',
        name: 'Owner B',
        role: 'OWNER',
      },
    ],
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

describe('listPaymentsForPlan', () => {
  test('returns [] for a plan with no payments', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    const rows = await listPaymentsForPlan(ctx, planId);
    expect(rows).toEqual([]);
  });

  test('orders payments by paidAt DESC (most recent first)', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Record three payments with strictly increasing paidAt values. Each pays
    // exactly one installment so allocation math doesn't fight the test.
    await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: new Date('2026-06-01T08:00:00Z'),
      method: 'TRANSFER',
    });
    await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: new Date('2026-06-15T08:00:00Z'),
      method: 'CASH',
    });
    await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: new Date('2026-07-01T08:00:00Z'),
      method: 'TRANSFER',
    });

    const rows = await listPaymentsForPlan(ctx, planId);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.paidAt.toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(rows[1]!.paidAt.toISOString()).toBe('2026-06-15T08:00:00.000Z');
    expect(rows[2]!.paidAt.toISOString()).toBe('2026-06-01T08:00:00.000Z');
    expect(rows[0]!.recordedByName).toBe('Owner A');
  });

  test('includes per-payment allocations with installment sequenceNos (manual split across 2)', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Activate plan with the deposit (FIFO).
    await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    const plan = await getPlan(ctx, planId);
    const inst1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    const inst2 = plan!.installments.find((i) => i.sequenceNo === 2)!;

    // Manual override: split a single payment across two installments.
    await recordPayment(ctx, {
      planId,
      amountKobo: 1_000_000_00n as Kobo,
      paidAt: new Date('2026-06-20T08:00:00Z'),
      method: 'CASH',
      allocations: [
        { installmentId: inst1.id, amountKobo: 800_000_00n as Kobo },
        { installmentId: inst2.id, amountKobo: 200_000_00n as Kobo },
      ],
    } as PaymentRecordInput);

    const rows = await listPaymentsForPlan(ctx, planId);
    expect(rows).toHaveLength(2);

    const splitRow = rows.find((r) => r.amountKobo === 1_000_000_00n)!;
    expect(splitRow.allocations).toHaveLength(2);
    expect(splitRow.allocations.map((a) => a.installmentSequenceNo)).toEqual([1, 2]);
    expect(splitRow.allocations[0]!.amountKobo).toBe(800_000_00n);
    expect(splitRow.allocations[1]!.amountKobo).toBe(200_000_00n);
  });

  test("excludes other plans' payments in the same tenant", async () => {
    const ctx = ctxFor(TENANT_A);
    const propertyA = await seedAvailableProperty(TENANT_A);
    const propertyB = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planA = await seedDraftPlan(ctx, propertyA.id, customer.id);
    const planB = await seedDraftPlan(ctx, propertyB.id, customer.id);

    await recordPayment(ctx, {
      planId: planA,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });
    await recordPayment(ctx, {
      planId: planB,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'CASH',
    });

    const rowsA = await listPaymentsForPlan(ctx, planA);
    const rowsB = await listPaymentsForPlan(ctx, planB);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]!.method).toBe('TRANSFER');
    expect(rowsB[0]!.method).toBe('CASH');
  });

  test('tenant isolation — tenant A cannot see tenant B payments', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);

    const propertyB = await seedAvailableProperty(TENANT_B);
    const customerB = await seedCustomer(TENANT_B);
    const planB = await seedDraftPlan(ctxB, propertyB.id, customerB.id);
    await recordPayment(ctxB, {
      planId: planB,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });

    // Sanity: tenant B sees its own row.
    const rowsB = await listPaymentsForPlan(ctxB, planB);
    expect(rowsB).toHaveLength(1);

    // Tenant A asking for tenant B's planId gets nothing back.
    const leak = await listPaymentsForPlan(ctxA, planB);
    expect(leak).toEqual([]);
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

  test('rejects allocations that target the same installment twice', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(TENANT_A);
    const customer = await seedCustomer(TENANT_A);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    const plan = await getPlan(ctx, planId);
    const monthly1 = plan!.installments.find((i) => i.sequenceNo === 1)!;

    await expect(
      recordPayment(ctx, {
        planId,
        amountKobo: 800_000_00n as Kobo,
        paidAt: onStartDay(),
        method: 'CASH',
        allocations: [
          { installmentId: monthly1.id, amountKobo: 400_000_00n as Kobo },
          { installmentId: monthly1.id, amountKobo: 400_000_00n as Kobo },
        ],
      } as PaymentRecordInput),
    ).rejects.toBeInstanceOf(AllocationDuplicateInstallmentError);

    const count = await pg.prisma.payment.count({ where: { planId } });
    expect(count).toBe(0);
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

    const loserErr = (rejected[0] as PromiseRejectedResult).reason;
    // recordPayment's property flip is idempotent, so the only error the SERIALIZABLE
    // loser can raise here is P2034 (PaymentRetryableSerializationError). When the
    // caller is plan-create (Task 3), PropertyNotAvailableError becomes possible.
    expect(loserErr).toBeInstanceOf(PaymentRetryableSerializationError);

    // Final state: exactly one plan ACTIVE, the other still DRAFT, property SOLD.
    const planA = await pg.prisma.plan.findUnique({ where: { id: planAId } });
    const planB = await pg.prisma.plan.findUnique({ where: { id: planBId } });
    const statuses = [planA!.status, planB!.status].sort();
    expect(statuses).toEqual(['ACTIVE', 'DRAFT']);
    const prop = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(prop!.status).toBe('SOLD');
  });
});

// ─── M5: reversePayment ───────────────────────────────────────────────────────

describe('reversePayment', () => {
  // Helper: seed a plan and activate it with a deposit payment.
  const seedActivePlan = async (ctx: TenantContext) => {
    const property = await seedAvailableProperty(ctx.tenantId);
    const customer = await seedCustomer(ctx.tenantId);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);
    const { paymentId: depositPaymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: 2_400_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });
    const plan = await getPlan(ctx, planId);
    return { planId, property, plan: plan!, depositPaymentId };
  };

  // 1. Happy path, single allocation
  test('reverses a single-allocation payment: installment reverts PAID → PENDING', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId, depositPaymentId } = await seedActivePlan(ctx);

    const result = await reversePayment(ctx, {
      paymentId: depositPaymentId,
      notes: 'Test reversal',
    });
    expect(result.reversalPaymentId).toBeDefined();
    expect(typeof result.planStatus).toBe('string');

    // Reversal payment row
    const reversalRow = await pg.prisma.payment.findUnique({
      where: { id: result.reversalPaymentId },
      include: { allocations: true },
    });
    expect(reversalRow).not.toBeNull();
    expect(reversalRow!.amountKobo).toBe(-2_400_000_00n);
    expect(reversalRow!.reversedById).toBe(depositPaymentId);
    expect(reversalRow!.notes).toBe('[Reversal] Test reversal');

    // Allocation is negative
    expect(reversalRow!.allocations).toHaveLength(1);
    expect(reversalRow!.allocations[0]!.amountKobo).toBe(-2_400_000_00n);

    // Installment reverted
    const plan = await getPlan(ctx, planId);
    expect(plan!.installments[0]!.status).toBe('PENDING');
    expect(plan!.installments[0]!.amountPaidKobo).toBe(0n);

    // listPaymentsForPlan: both rows mutually linked
    const rows = await listPaymentsForPlan(ctx, planId);
    expect(rows).toHaveLength(2);
    const originalRow = rows.find((r) => r.id === depositPaymentId)!;
    const reversalListRow = rows.find((r) => r.id === result.reversalPaymentId)!;
    expect(originalRow.reversedByPaymentId).toBe(result.reversalPaymentId);
    expect(reversalListRow.reversedById).toBe(depositPaymentId);
  });

  // 2. Happy path, multi-allocation
  test('reverses multi-allocation payment: both installments revert exactly', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId } = await seedActivePlan(ctx);

    // Second payment: partially pays inst1 (monthly#1) and inst2 (monthly#2)
    const plan = await getPlan(ctx, planId);
    const inst1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    const inst2 = plan!.installments.find((i) => i.sequenceNo === 2)!;

    const { paymentId: multiPaymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: 1_000_000_00n as Kobo,
      paidAt: new Date('2026-06-15T10:00:00Z'),
      method: 'CASH',
      allocations: [
        { installmentId: inst1.id, amountKobo: 800_000_00n as Kobo },
        { installmentId: inst2.id, amountKobo: 200_000_00n as Kobo },
      ],
    } as PaymentRecordInput);

    const result = await reversePayment(ctx, { paymentId: multiPaymentId });

    const reversalRow = await pg.prisma.payment.findUnique({
      where: { id: result.reversalPaymentId },
      include: { allocations: { orderBy: { createdAt: 'asc' } } },
    });
    expect(reversalRow!.amountKobo).toBe(-1_000_000_00n);
    expect(reversalRow!.allocations).toHaveLength(2);

    const allocAmounts = reversalRow!.allocations.map((a) => a.amountKobo).sort();
    expect(allocAmounts).toEqual([-800_000_00n, -200_000_00n].sort());

    // Both installments should be back to their state before multi-payment
    const planAfter = await getPlan(ctx, planId);
    const inst1After = planAfter!.installments.find((i) => i.sequenceNo === 1)!;
    const inst2After = planAfter!.installments.find((i) => i.sequenceNo === 2)!;
    expect(inst1After.amountPaidKobo).toBe(0n);
    expect(inst2After.amountPaidKobo).toBe(0n);
  });

  // 3. Plan COMPLETED → ACTIVE on reversal
  test('reversal of closing payment reverts plan COMPLETED → ACTIVE', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await seedAvailableProperty(ctx.tenantId);
    const customer = await seedCustomer(ctx.tenantId);
    const planId = await seedDraftPlan(ctx, property.id, customer.id);

    // Pay full plan in one shot
    const { paymentId: fullPaymentId, planStatus } = await recordPayment(ctx, {
      planId,
      amountKobo: 12_000_000_00n as Kobo,
      paidAt: onStartDay(),
      method: 'TRANSFER',
    });
    expect(planStatus).toBe('COMPLETED');

    const result = await reversePayment(ctx, { paymentId: fullPaymentId });
    expect(result.planStatus).toBe('ACTIVE');

    const planAfter = await getPlan(ctx, planId);
    expect(planAfter!.status).toBe('ACTIVE');
  });

  // 4. Already-reversed (race): second reverse attempt → PaymentAlreadyReversedError
  test('double-reverse: second attempt throws PaymentAlreadyReversedError', async () => {
    const ctx = ctxFor(TENANT_A);
    const { depositPaymentId } = await seedActivePlan(ctx);

    await reversePayment(ctx, { paymentId: depositPaymentId });

    await expect(
      reversePayment(ctx, { paymentId: depositPaymentId }),
    ).rejects.toBeInstanceOf(PaymentAlreadyReversedError);

    // Only one reversal row exists
    const count = await pg.prisma.payment.count({
      where: { reversedById: depositPaymentId },
    });
    expect(count).toBe(1);
  });

  // 5. Reverse of a reversal → CannotReverseReversalRowError
  test('reversing a reversal row throws CannotReverseReversalRowError', async () => {
    const ctx = ctxFor(TENANT_A);
    const { depositPaymentId } = await seedActivePlan(ctx);

    const { reversalPaymentId } = await reversePayment(ctx, { paymentId: depositPaymentId });

    await expect(
      reversePayment(ctx, { paymentId: reversalPaymentId }),
    ).rejects.toBeInstanceOf(CannotReverseReversalRowError);
  });

  // 6. Cross-tenant isolation: tenant B cannot reverse tenant A's payment
  test('cross-tenant: PaymentNotFoundError when paymentId belongs to different tenant', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);

    const { depositPaymentId } = await seedActivePlan(ctxA);

    await expect(
      reversePayment(ctxB, { paymentId: depositPaymentId }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  // 7. STAFF role rejected
  test('STAFF role: ForbiddenError, no DB writes', async () => {
    const ctxA = ctxFor(TENANT_A);
    const { depositPaymentId, planId } = await seedActivePlan(ctxA);

    const staffCtx: TenantContext = {
      tenantId: TENANT_A,
      user: {
        id: USER_ID,
        authUserId: AUTH_USER_ID,
        role: 'STAFF',
        email: 'staff@payments-test',
        mustChangePassword: false,
      },
    };

    await expect(
      reversePayment(staffCtx, { paymentId: depositPaymentId }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Ensure no reversal row was written
    const count = await pg.prisma.payment.count({ where: { reversedById: depositPaymentId } });
    expect(count).toBe(0);
    void planId;
  });

  // 8. OVERDUE walk-back: reversed status is OVERDUE
  test('OVERDUE walk-back: reversal drives installment status to OVERDUE when past dueDate', async () => {
    const ctx = ctxFor(TENANT_A);
    // Create a plan with a past start date so installment is overdue
    const pastStart = new Date('2025-01-01T00:00:00Z');
    const property = await seedAvailableProperty(ctx.tenantId);
    const customer = await seedCustomer(ctx.tenantId);
    const planId = await seedDraftPlan(ctx, property.id, customer.id, {
      startDate: pastStart,
    });

    // Pay deposit (installment #0, past due → would be OVERDUE if unpaid)
    const plan = await getPlan(ctx, planId);
    const depositInst = plan!.installments.find((i) => i.sequenceNo === 0)!;

    const { paymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: depositInst.amountDueKobo as Kobo,
      paidAt: pastStart,
      method: 'TRANSFER',
    });

    // Verify it's now PAID
    const planAfterPay = await getPlan(ctx, planId);
    const instAfterPay = planAfterPay!.installments.find((i) => i.sequenceNo === 0)!;
    expect(instAfterPay.status).toBe('PAID');

    // Reverse: since dueDate is in the past, reverting paid→unpaid should yield OVERDUE
    await reversePayment(ctx, { paymentId });

    const planAfterReverse = await getPlan(ctx, planId);
    const instAfterReverse = planAfterReverse!.installments.find((i) => i.sequenceNo === 0)!;
    expect(instAfterReverse.amountPaidKobo).toBe(0n);
    expect(instAfterReverse.status).toBe('OVERDUE');
  });

  // 9. PARTIAL walk-back: reverse second payment; inst2 PARTIAL→PENDING; inst1 untouched
  test('PARTIAL walk-back: reversing second payment leaves first installment intact', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId } = await seedActivePlan(ctx);

    // First payment fully pays installment #1 (monthly)
    const plan = await getPlan(ctx, planId);
    const inst1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    const inst2 = plan!.installments.find((i) => i.sequenceNo === 2)!;

    await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: new Date('2026-06-15T10:00:00Z'),
      method: 'TRANSFER',
      allocations: [{ installmentId: inst1.id, amountKobo: 800_000_00n as Kobo }],
    } as PaymentRecordInput);

    // Second payment partially pays installment #2
    const { paymentId: secondPaymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: 300_000_00n as Kobo,
      paidAt: new Date('2026-06-20T10:00:00Z'),
      method: 'CASH',
      allocations: [{ installmentId: inst2.id, amountKobo: 300_000_00n as Kobo }],
    } as PaymentRecordInput);

    const planBeforeReverse = await getPlan(ctx, planId);
    expect(planBeforeReverse!.installments.find((i) => i.sequenceNo === 1)!.status).toBe('PAID');
    expect(planBeforeReverse!.installments.find((i) => i.sequenceNo === 2)!.status).toBe('PARTIAL');

    // Reverse only the second payment
    await reversePayment(ctx, { paymentId: secondPaymentId });

    const planAfter = await getPlan(ctx, planId);
    expect(planAfter!.installments.find((i) => i.sequenceNo === 1)!.status).toBe('PAID');   // untouched
    expect(planAfter!.installments.find((i) => i.sequenceNo === 2)!.status).toBe('PENDING'); // reverted
    expect(planAfter!.installments.find((i) => i.sequenceNo === 2)!.amountPaidKobo).toBe(0n);
  });

  // 10. Plan stays ACTIVE when reversing a non-closing payment
  test('plan stays ACTIVE when reversing a payment that did not close the plan', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId, depositPaymentId } = await seedActivePlan(ctx);

    // Record a second small payment
    const plan = await getPlan(ctx, planId);
    const inst1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    const { paymentId: smallPaymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: new Date('2026-06-15T10:00:00Z'),
      method: 'TRANSFER',
      allocations: [{ installmentId: inst1.id, amountKobo: 800_000_00n as Kobo }],
    } as PaymentRecordInput);

    const result = await reversePayment(ctx, { paymentId: smallPaymentId });
    expect(result.planStatus).toBe('ACTIVE');

    const planAfter = await getPlan(ctx, planId);
    expect(planAfter!.status).toBe('ACTIVE');

    void depositPaymentId;
  });

  // 11. Property stays SOLD when reversing a payment
  test('property stays SOLD when reversing a payment; property status is immutable after activation', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId, property } = await seedActivePlan(ctx);

    // Verify property is SOLD after activation
    const propBefore = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(propBefore!.status).toBe('SOLD');

    const plan = await getPlan(ctx, planId);
    const inst1 = plan!.installments.find((i) => i.sequenceNo === 1)!;
    const { paymentId: smallPaymentId } = await recordPayment(ctx, {
      planId,
      amountKobo: 800_000_00n as Kobo,
      paidAt: new Date('2026-06-15T10:00:00Z'),
      method: 'TRANSFER',
      allocations: [{ installmentId: inst1.id, amountKobo: 800_000_00n as Kobo }],
    } as PaymentRecordInput);

    await reversePayment(ctx, { paymentId: smallPaymentId });

    // Property still SOLD — reversal does not touch property status
    const propAfter = await pg.prisma.property.findUnique({ where: { id: property.id } });
    expect(propAfter!.status).toBe('SOLD');
    void planId;
  });

  // Bonus: no notes → '[Reversal]' prefix only
  test('reversal with no notes produces [Reversal] prefix only', async () => {
    const ctx = ctxFor(TENANT_A);
    const { depositPaymentId } = await seedActivePlan(ctx);

    const { reversalPaymentId } = await reversePayment(ctx, { paymentId: depositPaymentId });
    const row = await pg.prisma.payment.findUnique({ where: { id: reversalPaymentId } });
    expect(row!.notes).toBe('[Reversal]');
  });
});
