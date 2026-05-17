import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { getDashboardStats, listRecentActivity } from '../src/dashboard-service.js';
import { createPlan } from '../src/plans-service.js';
import { recordPayment, reversePayment } from '../src/payments-service.js';
import { createCustomer } from '../src/customers-service.js';
import { createProperty } from '../src/properties-service.js';
import type { TenantContext } from '@solutio/shared/tenant';
import type { Kobo } from '@solutio/shared/money';

let pg: TestPostgres;

const TENANT_A = '01935b7e-0007-7000-8000-000000000001';
const TENANT_B = '01935b7e-0007-7000-8000-000000000002';
const USER_A = '01935b7e-0007-7000-8000-aaaaaaaaaaaa';
const USER_B = '01935b7e-0007-7000-8000-bbbbbbbbbbbb';
const AUTH_USER_A = '01935b7e-0007-7000-8000-cccccccccccc';
const AUTH_USER_B = '01935b7e-0007-7000-8000-dddddddddddd';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: tenantId === TENANT_A ? USER_A : USER_B,
    authUserId: tenantId === TENANT_A ? AUTH_USER_A : AUTH_USER_B,
    role: 'OWNER',
    email: `owner@${tenantId === TENANT_A ? 'a' : 'b'}-dash`,
    mustChangePassword: false,
  },
});

let codeSeq = 0;
const nextCode = (prefix = 'DASH') => `${prefix}-${(++codeSeq).toString().padStart(5, '0')}`;

let phoneSeq = 0;
const nextPhone = () => `+23480${(++phoneSeq).toString().padStart(8, '0')}`;

beforeAll(async () => {
  pg = await startPostgres();
}, 120_000);

afterAll(async () => {
  await pg?.stop();
});

beforeEach(async () => {
  await pg.prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "PaymentAllocation","Payment","Installment","Plan","Property","Customer","User","Tenant" RESTART IDENTITY CASCADE',
  );
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'dash-tenant-a', name: 'Dash A' },
      { id: TENANT_B, slug: 'dash-tenant-b', name: 'Dash B' },
    ],
  });
  await pg.prisma.user.createMany({
    data: [
      {
        id: USER_A,
        tenantId: TENANT_A,
        authUserId: AUTH_USER_A,
        email: 'owner@a-dash',
        name: 'Owner A',
        role: 'OWNER',
      },
      {
        id: USER_B,
        tenantId: TENANT_B,
        authUserId: AUTH_USER_B,
        email: 'owner@b-dash',
        name: 'Owner B',
        role: 'OWNER',
      },
    ],
  });
});

type SeedPlanOpts = {
  ctx: TenantContext;
  startDate: Date;
  installmentCount: number;
  monthlyKobo: bigint;
};

async function seedDraftPlan(opts: SeedPlanOpts): Promise<{ planId: string; propertyId: string }> {
  const totalPriceKobo = (opts.monthlyKobo * BigInt(opts.installmentCount)) as Kobo;
  const customer = await createCustomer(opts.ctx, { fullName: 'Buyer', phone: nextPhone() });
  const property = await createProperty(opts.ctx, {
    code: nextCode(),
    title: 'Unit',
    addressLine: '1 Test St',
    city: 'Lagos',
    totalPriceKobo,
  });
  const plan = await createPlan(opts.ctx, {
    customer: { mode: 'existing', id: customer.id },
    propertyId: property.id,
    totalPriceKobo,
    depositKobo: 0n as Kobo,
    monthlyKobo: opts.monthlyKobo as Kobo,
    termMonths: opts.installmentCount,
    startDate: opts.startDate,
    depositReceived: false,
  });
  return { planId: plan.id, propertyId: property.id };
}

async function seedActivePlan(opts: SeedPlanOpts): Promise<{ planId: string; propertyId: string }> {
  const seeded = await seedDraftPlan(opts);
  await pg.prisma.plan.update({
    where: { id: seeded.planId },
    data: { status: 'ACTIVE' },
  });
  return seeded;
}

describe('getDashboardStats', () => {
  test('zero state on a clean tenant', async () => {
    const ctx = ctxFor(TENANT_A);
    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats).toEqual({
      todayNetTotalKobo: 0n,
      overdueInstallmentCount: 0,
      activePlanCount: 0,
    });
  });

  test('activePlanCount counts only Plans with status=ACTIVE and deletedAt=null', async () => {
    const ctx = ctxFor(TENANT_A);
    const startDate = new Date('2026-01-01T00:00:00Z');
    const monthlyKobo = 100_000_00n;
    const count = 6;

    // 1) ACTIVE plan (should be counted)
    await seedActivePlan({ ctx, startDate, installmentCount: count, monthlyKobo });

    // 2) DRAFT plan (should NOT be counted)
    await seedDraftPlan({ ctx, startDate, installmentCount: count, monthlyKobo });

    // 3) CANCELLED plan (should NOT be counted)
    const cancelled = await seedActivePlan({ ctx, startDate, installmentCount: count, monthlyKobo });
    await pg.prisma.plan.update({
      where: { id: cancelled.planId },
      data: { status: 'CANCELLED' },
    });

    // 4) Soft-deleted ACTIVE plan (should NOT be counted)
    const deleted = await seedActivePlan({ ctx, startDate, installmentCount: count, monthlyKobo });
    await pg.prisma.plan.update({
      where: { id: deleted.planId },
      data: { deletedAt: new Date('2026-04-01T00:00:00Z') },
    });

    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.activePlanCount).toBe(1);
  });

  test('overdueInstallmentCount counts installments with status!=PAID and dueDate<now', async () => {
    const ctx = ctxFor(TENANT_A);
    // Plan starting 2026-01-01 with 6 monthly installments → dueDates Feb..Jul.
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });

    // generateSchedule produces a sequenceNo=0 deposit row (dueDate=startDate,
    // amount=0 since we passed depositKobo=0n) plus 6 monthly rows. The seq=0
    // zero-amount row is excluded by the production query's `amountDueKobo > 0`
    // filter, so we only need to mark seq=1 PAID to demonstrate the
    // PAID-exclusion rule on a real (non-zero) overdue installment.
    await pg.prisma.installment.updateMany({
      where: { planId: seeded.planId, sequenceNo: 1 },
      data: { status: 'PAID' },
    });

    const now = new Date('2026-05-17T13:30:00Z');
    const stats = await getDashboardStats(ctx, now);
    // Monthly due dates: Feb 1, Mar 1, Apr 1, May 1, Jun 1, Jul 1 — at now=May 17:
    //   seq0 Jan 1 (zero-amount deposit, excluded by amountDueKobo>0),
    //   seq1 Feb 1 (PAID, excluded),
    //   seq2 Mar 1, seq3 Apr 1, seq4 May 1 → overdue (3)
    //   seq5 Jun 1, seq6 Jul 1 → future
    expect(stats.overdueInstallmentCount).toBe(3);
  });

  test('overdueInstallmentCount excludes installments on CANCELLED plans', async () => {
    const ctx = ctxFor(TENANT_A);
    // Seed an ACTIVE plan, then mark it CANCELLED (with deletedAt still null).
    const { planId } = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });
    await pg.prisma.plan.update({ where: { id: planId }, data: { status: 'CANCELLED' } });
    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.overdueInstallmentCount).toBe(0);
  });

  test('overdueInstallmentCount excludes WAIVED installments', async () => {
    const ctx = ctxFor(TENANT_A);
    const { planId } = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });
    // Mark all overdue installments (seq 1..4, due Feb..May, all <2026-05-17) as WAIVED.
    // The seq=0 zero-amount deposit row is excluded automatically by the amountDueKobo>0 filter.
    await pg.prisma.installment.updateMany({
      where: { planId, sequenceNo: { in: [1, 2, 3, 4] } },
      data: { status: 'WAIVED' },
    });
    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.overdueInstallmentCount).toBe(0);
  });

  test('overdueInstallmentCount excludes zero-amount installments (materialization deposit rows)', async () => {
    const ctx = ctxFor(TENANT_A);
    // A fresh ACTIVE plan with depositKobo=0n produces a zero-amount seq=0 row at dueDate=startDate.
    // With now=2026-05-17 that row is in the past — but it must not count as overdue.
    // No other installments are past-due in this scenario (start 2026-05-01 → first non-deposit due 2026-06-01).
    await seedActivePlan({
      ctx,
      startDate: new Date('2026-05-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });
    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.overdueInstallmentCount).toBe(0);
  });

  test('overdueInstallmentCount excludes installments on soft-deleted plans', async () => {
    const ctx = ctxFor(TENANT_A);
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });
    await pg.prisma.plan.update({
      where: { id: seeded.planId },
      data: { deletedAt: new Date('2026-04-01T00:00:00Z') },
    });

    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.overdueInstallmentCount).toBe(0);
  });

  test('todayNetTotalKobo sums payments in the Lagos-local day window, net of reversals', async () => {
    const ctx = ctxFor(TENANT_A);
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });

    // Record a payment dated 2026-05-17T10:00:00Z (Lagos = UTC+1 → 2026-05-17 11:00 local, in window).
    const paid = await recordPayment(ctx, {
      planId: seeded.planId,
      amountKobo: 100_000_00n as Kobo,
      paidAt: new Date('2026-05-17T10:00:00Z'),
      method: 'TRANSFER',
    });

    // Reverse it (reversePayment sets paidAt = now()). Force the reversal's paidAt
    // into the same Lagos day window so both rows fall inside [startUtc, endUtc).
    const reversal = await reversePayment(ctx, { paymentId: paid.paymentId });
    await pg.prisma.payment.update({
      where: { id: reversal.reversalPaymentId },
      data: { paidAt: new Date('2026-05-17T11:00:00Z') },
    });

    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.todayNetTotalKobo).toBe(0n);
  });

  test('todayNetTotalKobo excludes payments outside the Lagos-local day', async () => {
    const ctx = ctxFor(TENANT_A);
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });

    // 2026-05-16T22:30:00Z = 2026-05-16 23:30 Lagos local — previous Lagos day.
    await recordPayment(ctx, {
      planId: seeded.planId,
      amountKobo: 100_000_00n as Kobo,
      paidAt: new Date('2026-05-16T22:30:00Z'),
      method: 'TRANSFER',
    });

    const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
    expect(stats.todayNetTotalKobo).toBe(0n);
  });
});

describe('listRecentActivity', () => {
  test('returns up to limit rows ordered by paidAt desc', async () => {
    const ctx = ctxFor(TENANT_A);
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 12,
      monthlyKobo: 100_000_00n,
    });

    // Record 12 payments at distinct paidAt 2026-05-01..2026-05-12.
    for (let i = 0; i < 12; i++) {
      const day = (i + 1).toString().padStart(2, '0');
      await recordPayment(ctx, {
        planId: seeded.planId,
        amountKobo: 100_000_00n as Kobo,
        paidAt: new Date(`2026-05-${day}T10:00:00Z`),
        method: 'TRANSFER',
      });
    }

    const rows = await listRecentActivity(ctx, 10);
    expect(rows).toHaveLength(10);

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!.paidAt.getTime();
      const curr = rows[i]!.paidAt.getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }

    // Newest should be 2026-05-12, oldest in the slice should be 2026-05-03.
    expect(rows[0]!.paidAt.toISOString()).toBe('2026-05-12T10:00:00.000Z');
    expect(rows[9]!.paidAt.toISOString()).toBe('2026-05-03T10:00:00.000Z');
  });

  test('isReversal=true for reversal rows, false for originals', async () => {
    const ctx = ctxFor(TENANT_A);
    const seeded = await seedActivePlan({
      ctx,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });

    const paid = await recordPayment(ctx, {
      planId: seeded.planId,
      amountKobo: 100_000_00n as Kobo,
      paidAt: new Date('2026-05-17T10:00:00Z'),
      method: 'TRANSFER',
    });
    await reversePayment(ctx, { paymentId: paid.paymentId });

    const rows = await listRecentActivity(ctx, 10);
    expect(rows).toHaveLength(2);

    const reversalRow = rows.find((r) => r.amountKobo < 0n);
    const originalRow = rows.find((r) => r.amountKobo > 0n);
    expect(reversalRow).toBeDefined();
    expect(originalRow).toBeDefined();
    expect(reversalRow!.isReversal).toBe(true);
    expect(originalRow!.isReversal).toBe(false);
  });

  test('excludes payments from other tenants (forTenant guard)', async () => {
    const ctxB = ctxFor(TENANT_B);
    const seeded = await seedActivePlan({
      ctx: ctxB,
      startDate: new Date('2026-01-01T00:00:00Z'),
      installmentCount: 6,
      monthlyKobo: 100_000_00n,
    });
    await recordPayment(ctxB, {
      planId: seeded.planId,
      amountKobo: 100_000_00n as Kobo,
      paidAt: new Date('2026-05-17T10:00:00Z'),
      method: 'TRANSFER',
    });

    const ctxA = ctxFor(TENANT_A);
    const rows = await listRecentActivity(ctxA, 10);
    expect(rows).toEqual([]);
  });
});
