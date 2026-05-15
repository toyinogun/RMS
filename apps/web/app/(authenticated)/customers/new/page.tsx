import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant-context';
import { CustomerForm } from '@/components/customers/customer-form';
import { createCustomerAction } from '@/server-actions/customers/create';
import type { CustomerActionState } from '@/server-actions/customers/create';

export const dynamic = 'force-dynamic';

export default async function NewCustomerPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  async function handleSubmit(fd: FormData): Promise<CustomerActionState> {
    'use server';
    return createCustomerAction(null, fd);
  }

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New customer</h1>
        <Link href="/customers" className="text-sm text-slate-600 hover:underline">Cancel</Link>
      </header>
      <CustomerForm mode="create" variant="page" onSubmit={handleSubmit} />
    </section>
  );
}
