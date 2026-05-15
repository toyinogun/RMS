import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import { getPlan } from '@solutio/db/plans-service';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstallmentsTable } from '@/components/plans/installments-table';
import { PlanCancelButton } from '@/components/plans/plan-cancel-button';

export const dynamic = 'force-dynamic';

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

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const plan = await getPlan(ctx, id);
  if (!plan) notFound();

  const canCancel = plan.status === 'DRAFT' && hasRole(ctx, ['OWNER', 'ADMIN']);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">
            {plan.customer.fullName} · {plan.property.code}
          </h1>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant[plan.status] ?? 'outline'}>{plan.status}</Badge>
            {canCancel ? <PlanCancelButton id={plan.id} /> : null}
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Created {plan.createdAt.toISOString().slice(0, 10)} · Start {plan.startDate.toISOString().slice(0, 10)}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-md border p-4 md:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Total price</dt>
          <dd className="text-sm font-medium">{formatKobo(plan.totalPriceKobo as Kobo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Deposit</dt>
          <dd className="text-sm font-medium">{formatKobo(plan.depositKobo as Kobo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Monthly</dt>
          <dd className="text-sm font-medium">{formatKobo(plan.monthlyKobo as Kobo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Term</dt>
          <dd className="text-sm font-medium">{plan.termMonths} months</dd>
        </div>
      </dl>

      <Tabs defaultValue="installments">
        <TabsList>
          <TabsTrigger value="installments">Installments</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>
        <TabsContent value="installments">
          <InstallmentsTable
            installments={plan.installments.map((i) => ({
              id: i.id,
              sequenceNo: i.sequenceNo,
              dueDate: i.dueDate,
              amountDueKobo: i.amountDueKobo,
              amountPaidKobo: i.amountPaidKobo,
              status: i.status,
            }))}
          />
        </TabsContent>
        <TabsContent value="payments">
          <div className="rounded-md border p-6 text-center text-sm text-slate-500">
            Payments are recorded in M4.
          </div>
        </TabsContent>
        <TabsContent value="actions">
          <div className="space-y-2 rounded-md border p-6 text-sm text-slate-500">
            More plan actions ship in upcoming milestones.
            {!canCancel ? (
              <p className="text-xs">
                Only OWNER/ADMIN can cancel a DRAFT plan.{' '}
                <Link href={'/plans' as Route} className="underline">
                  Back to plans
                </Link>
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
