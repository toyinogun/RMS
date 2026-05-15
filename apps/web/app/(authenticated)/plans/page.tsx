import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { listPlans } from '@solutio/db/plans-service';
import { planListFilterSchema } from '@solutio/shared/installments';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'] as const;

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  COMPLETED: 'default',
  CANCELLED: 'outline',
  DEFAULTED: 'destructive',
};

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  const raw = await searchParams;
  const filter = planListFilterSchema.parse({ status: raw.status, q: raw.q });
  const plans = await listPlans(ctx, filter);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Plans</h1>
        <Button asChild>
          <Link href={'/plans/new' as Route}>New plan</Link>
        </Button>
      </header>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="status" className="text-xs text-slate-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filter.status}
            className="border-input bg-background h-9 w-40 rounded-md border px-2 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="q" className="text-xs text-slate-600">
            Search
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={filter.q ?? ''}
            placeholder="Customer name or property code"
            className="h-9 w-72 rounded-md border border-slate-300 px-3 text-sm"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Property</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                No plans match this filter.
              </TableCell>
            </TableRow>
          ) : (
            plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/plans/${p.id}` as Route} className="hover:underline">
                    {p.customer.fullName}
                  </Link>
                </TableCell>
                <TableCell>{p.property.code}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[p.status] ?? 'outline'}>{p.status}</Badge>
                </TableCell>
                <TableCell>{formatKobo(p.totalPriceKobo as Kobo)}</TableCell>
                <TableCell>{p.termMonths} mo</TableCell>
                <TableCell>{p.createdAt.toISOString().slice(0, 10)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
