import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import { listCustomers } from '@solutio/db/customers-service';
import { listProperties } from '@solutio/db/properties-service';
import type { Kobo } from '@solutio/shared/money';
import { PlanForm } from '@/components/plans/plan-form';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) redirect('/');

  const [customers, properties] = await Promise.all([
    listCustomers(ctx, {}),
    listProperties(ctx, { status: 'AVAILABLE' }),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New plan</h1>
        <Link href={'/plans' as Route} className="text-sm text-slate-600 hover:underline">
          Cancel
        </Link>
      </header>
      <PlanForm
        customers={customers.map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone }))}
        properties={properties.map((p) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          addressLine: p.addressLine,
          totalPriceKobo: p.totalPriceKobo as Kobo,
        }))}
      />
    </section>
  );
}
