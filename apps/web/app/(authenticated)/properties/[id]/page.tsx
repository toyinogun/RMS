import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { getProperty } from '@solutio/db/properties-service';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PropertyDeleteButton } from '@/components/properties/property-delete-button';
import { PropertyStatusControl } from '@/components/properties/property-status-control';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { id } = await params;
  const property = await getProperty(ctx, id);
  if (!property) notFound();

  const canChange = property.plans.every((p) => p.status === 'CANCELLED');

  return (
    <section className="max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{property.title}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties/${property.id}/edit` as Route}>Edit</Link>
          </Button>
          <PropertyDeleteButton id={property.id} />
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Code</dt>
          <dd className="mt-1 text-sm text-slate-900">{property.code}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">City</dt>
          <dd className="mt-1 text-sm text-slate-900">{property.city}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Address</dt>
          <dd className="mt-1 text-sm text-slate-900">{property.addressLine}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Total price</dt>
          <dd className="mt-1 text-sm text-slate-900">
            {formatKobo(property.totalPriceKobo as Kobo)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Status</dt>
          <dd className="mt-1">
            <PropertyStatusControl
              id={property.id}
              currentStatus={property.status as 'AVAILABLE' | 'RESERVED' | 'SOLD'}
              canChange={canChange}
            />
          </dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Plans</h2>
        {property.plans.length === 0 ? (
          <p className="text-sm text-slate-500">No plans yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {property.plans.map((plan) => (
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
