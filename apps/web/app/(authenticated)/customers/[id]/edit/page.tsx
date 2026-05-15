import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { getCustomer } from '@solutio/db/customers-service';
import { CustomerForm } from '@/components/customers/customer-form';
import { updateCustomerAction } from '@/server-actions/customers/update';
import type { CustomerActionState } from '@/server-actions/customers/create';

export const dynamic = 'force-dynamic';

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { id } = await params;
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();

  async function handleSubmit(fd: FormData): Promise<CustomerActionState> {
    'use server';
    return updateCustomerAction(null, fd);
  }

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit customer</h1>
        <Link href={`/customers/${customer.id}` as Route} className="text-sm text-slate-600 hover:underline">
          Cancel
        </Link>
      </header>
      <CustomerForm
        mode="edit"
        variant="page"
        initial={customer}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
