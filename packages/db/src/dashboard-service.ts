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
 * Read-only dashboard stats for the signed-in tenant.
 *
 * - `todayNetTotalKobo`: sum of `Payment.amountKobo` whose `paidAt` falls within
 *   the tenant-local day (Lagos). Reversal rows carry negative `amountKobo`,
 *   so the total is naturally net-of-reversals.
 * - `overdueInstallmentCount`: installments where `status NOT IN (PAID, WAIVED)`,
 *   `amountDueKobo > 0`, `dueDate < now`, on an ACTIVE non-soft-deleted plan.
 *   The status and amount filters exclude waived and zero-amount deposit rows;
 *   the plan filter excludes DRAFT/COMPLETED/DEFAULTED/CANCELLED plans.
 * - `activePlanCount`: plans with `status='ACTIVE'` and `deletedAt=null`.
 *
 * All three reads are issued in one tenant-scoped `$transaction([...])`.
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
        status: { notIn: ['PAID', 'WAIVED'] },
        amountDueKobo: { gt: 0n },
        dueDate: { lt: effectiveNow },
        plan: { deletedAt: null, status: 'ACTIVE' },
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
 * `reversedById` is set ONLY on a reversal Payment row, where it holds the ID
 * of the original payment being reversed. So `reversedById !== null` ⇒ this
 * row is itself a reversal (and its `amountKobo` is stored negative).
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
