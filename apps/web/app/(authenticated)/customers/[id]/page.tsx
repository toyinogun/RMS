import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@solutio/db/client';
import { getCustomer } from '@solutio/db/customers-service';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomerDeleteButton } from '@/components/customers/customer-delete-button';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { id } = await params;
  const customer = await getCustomer(prisma, ctx, id);
  if (!customer) notFound();

  return (
    <section className="max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{customer.fullName}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/customers/${customer.id}/edit`}>Edit</Link>
          </Button>
          <CustomerDeleteButton id={customer.id} />
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Phone</dt>
          <dd className="mt-1 text-sm text-slate-900">{customer.phone}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Email</dt>
          <dd className="mt-1 text-sm text-slate-900">{customer.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">National ID</dt>
          <dd className="mt-1 text-sm text-slate-900">{customer.nationalId ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Notes</dt>
          <dd className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{customer.notes ?? '—'}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Plans</h2>
        {customer.plans.length === 0 ? (
          <p className="text-sm text-slate-500">No plans yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {customer.plans.map((plan) => (
              <li key={plan.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/plans/${plan.id}` as Route}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {plan.id.slice(0, 8)}…
                  </Link>
                  <Badge variant={planBadgeVariant(plan.status)}>{plan.status}</Badge>
                </div>
                <span className="text-sm text-slate-700">
                  {formatKobo(plan.totalPriceKobo as Kobo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function planBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'ACTIVE':
      return 'default';
    case 'PENDING':
      return 'secondary';
    case 'CANCELLED':
      return 'outline';
    default:
      return 'secondary';
  }
}
