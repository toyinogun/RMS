import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { signOutAction } from '@/server-actions/sign-out';
import { getDashboardStats, listRecentActivity } from '@solutio/db/dashboard-service';
import { formatKobo } from '@solutio/shared/money';
import { StatCard } from '@/components/dashboard/stat-card';
import { RecentActivityTable } from '@/components/dashboard/recent-activity-table';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(ctx),
    listRecentActivity(ctx, 10),
  ]);

  const todayTone: 'default' | 'destructive' =
    stats.todayNetTotalKobo < 0n ? 'destructive' : 'default';
  const overdueTone: 'default' | 'warning' =
    stats.overdueInstallmentCount > 0 ? 'warning' : 'default';

  return (
    <section className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as <span className="font-medium">{ctx.user.email}</span> ({ctx.user.role}).
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Today's payments"
          value={formatKobo(stats.todayNetTotalKobo)}
          hint="Net of reversals, Lagos time"
          tone={todayTone}
          testId="stat-card-today-payments"
        />
        <StatCard
          label="Overdue installments"
          value={stats.overdueInstallmentCount.toString()}
          hint="Past due and not yet paid"
          tone={overdueTone}
          testId="stat-card-overdue-installments"
        />
        <StatCard
          label="Active plans"
          value={stats.activePlanCount.toString()}
          hint="Plans currently collecting"
          testId="stat-card-active-plans"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityTable rows={recentActivity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href={'/customers' as Route}
            className="rounded-lg border border-paper-300 bg-paper-50 p-4 transition hover:border-paper-400 hover:bg-paper-100"
          >
            <h3 className="font-semibold text-ink-900">Customers</h3>
            <p className="mt-1 text-sm text-ink-500">Manage customer profiles</p>
          </Link>
          <Link
            href={'/properties' as Route}
            className="rounded-lg border border-paper-300 bg-paper-50 p-4 transition hover:border-paper-400 hover:bg-paper-100"
          >
            <h3 className="font-semibold text-ink-900">Properties</h3>
            <p className="mt-1 text-sm text-ink-500">Manage property listings</p>
          </Link>
          <Link
            href={'/plans' as Route}
            className="rounded-lg border border-paper-300 bg-paper-50 p-4 transition hover:border-paper-400 hover:bg-paper-100"
          >
            <h3 className="font-semibold text-ink-900">Plans</h3>
            <p className="mt-1 text-sm text-ink-500">Create and track installment plans</p>
          </Link>
        </div>
      </section>

      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded border border-paper-300 px-4 py-2 text-sm text-ink-700 hover:bg-paper-100"
        >
          Sign out
        </button>
      </form>
    </section>
  );
}
