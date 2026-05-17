import type { PaymentMethod } from '@prisma/client';
import type { Kobo } from '@solutio/shared/money';
import type { TenantContext } from '@solutio/shared/tenant';
import { tenantDayRange } from '@solutio/shared/dates';
import { forTenant } from './tenant-client';
import { prisma } from './client';

export type DashboardStats = Readonly<{
  todayNetTotalKobo: Kobo;
  overdueInstallmentCount: number;
  activePlanCount: number;
}>;

export type RecentActivityRow = Readonly<{
  id: string;
  planId: string;
  amountKobo: Kobo;
  paidAt: Date;
  method: PaymentMethod;
  isReversal: boolean;
  customerName: string;
  propertyCode: string;
}>;

/**
 * Aggregate the three home-dashboard counters in a single round-trip:
 *   - todayNetTotalKobo   — net payments inside the tenant-local day window
 *   - overdueInstallmentCount — installments past due (status≠PAID, dueDate<now)
 *                                on non-soft-deleted plans
 *   - activePlanCount     — plans with status=ACTIVE and deletedAt=null
 *
 * `now` is injectable for deterministic tests. Defaults to `new Date()`.
 */
export async function getDashboardStats(
  ctx: TenantContext,
  now?: Date,
): Promise<DashboardStats> {
  const effectiveNow = now ?? new Date();
  const { startUtc, endUtc } = tenantDayRange(effectiveNow);
  const scoped = forTenant(prisma, ctx.tenantId);

  const [paymentAgg, overdueCount, activePlanCount] = await scoped.$transaction([
    scoped.payment.aggregate({
      where: { paidAt: { gte: startUtc, lt: endUtc } },
      _sum: { amountKobo: true },
    }),
    scoped.installment.count({
      where: {
        status: { not: 'PAID' },
        dueDate: { lt: effectiveNow },
        plan: { deletedAt: null },
      },
    }),
    scoped.plan.count({
      where: { status: 'ACTIVE', deletedAt: null },
    }),
  ]);

  return {
    todayNetTotalKobo: (paymentAgg._sum.amountKobo ?? 0n) as Kobo,
    overdueInstallmentCount: overdueCount,
    activePlanCount,
  };
}

/**
 * Most-recent payment rows for the home dashboard's "Recent activity" panel.
 * Returns up to `limit` rows ordered by paidAt desc, each joined with the plan's
 * customer name and property code for display.
 *
 * `isReversal` is derived from `reversedById`: when set, this row is the reversal
 * row created by `reversePayment` (its amountKobo is negative).
 */
export async function listRecentActivity(
  ctx: TenantContext,
  limit = 10,
): Promise<RecentActivityRow[]> {
  const scoped = forTenant(prisma, ctx.tenantId);

  const payments = await scoped.payment.findMany({
    orderBy: { paidAt: 'desc' },
    take: limit,
    select: {
      id: true,
      planId: true,
      amountKobo: true,
      paidAt: true,
      method: true,
      reversedById: true,
      plan: {
        select: {
          customer: { select: { fullName: true } },
          property: { select: { code: true } },
        },
      },
    },
  });

  return payments.map((p) => ({
    id: p.id,
    planId: p.planId,
    amountKobo: p.amountKobo as Kobo,
    paidAt: p.paidAt,
    method: p.method,
    isReversal: p.reversedById !== null,
    customerName: p.plan.customer.fullName,
    propertyCode: p.plan.property.code,
  }));
}
