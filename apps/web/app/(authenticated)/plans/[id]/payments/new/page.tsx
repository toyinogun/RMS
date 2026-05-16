import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import { getPlan } from '@solutio/db/plans-service';
import type { Kobo } from '@solutio/shared/money';
import type { InstallmentStatus } from '@solutio/shared/installments';
import { PaymentForm } from '@/components/payments/payment-form';
import {
  recordPaymentAction,
  type PaymentRecordState,
} from '@/server-actions/payments/record';

export const dynamic = 'force-dynamic';

export default async function RecordPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) redirect('/');

  const { id } = await params;
  const plan = await getPlan(ctx, id);
  if (!plan) notFound();

  // DRAFT plans receive their first payment via the deposit toggle on
  // /plans/new; ad-hoc payments are only allowed on ACTIVE plans in M4.
  // COMPLETED / CANCELLED / DEFAULTED also redirect back to the plan detail.
  if (plan.status !== 'ACTIVE') redirect(`/plans/${id}` as Route);

  // PaymentForm expects a single-arg `(formData) => Promise<state>` shape,
  // while recordPaymentAction follows the useActionState `(prev, formData)`
  // contract. Adapt it here so the client component can call it directly.
  async function onSubmit(formData: FormData): Promise<PaymentRecordState> {
    'use server';
    return recordPaymentAction(null, formData);
  }

  const outstandingKobo = plan.installments.reduce(
    (acc, i) => acc + ((i.amountDueKobo as bigint) - (i.amountPaidKobo as bigint)),
    0n,
  ) as Kobo;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link
            href={`/plans/${plan.id}` as Route}
            className="underline-offset-4 hover:underline"
          >
            ← Back to plan
          </Link>
        </p>
        <h1 className="text-xl font-semibold">Record payment</h1>
        <p className="text-sm text-slate-600">
          {plan.customer.fullName} · {plan.property.code}
        </p>
      </header>

      <PaymentForm
        plan={{
          id: plan.id,
          customerName: plan.customer.fullName,
          propertyCode: plan.property.code,
          totalPriceKobo: plan.totalPriceKobo as Kobo,
          outstandingKobo,
          status: plan.status,
        }}
        installments={plan.installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          dueDate: i.dueDate,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
          status: i.status as InstallmentStatus,
        }))}
        onSubmit={onSubmit}
      />
    </section>
  );
}
