import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { PropertyForm } from '@/components/properties/property-form';
import { createPropertyAction } from '@/server-actions/properties/create';
import type { PropertyActionState } from '@/server-actions/properties/create';

export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  async function handleSubmit(fd: FormData): Promise<PropertyActionState> {
    'use server';
    return createPropertyAction(null, fd);
  }

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New property</h1>
        <Link href={'/properties' as Route} className="text-sm text-slate-600 hover:underline">Cancel</Link>
      </header>
      <PropertyForm mode="create" variant="page" onSubmit={handleSubmit} />
    </section>
  );
}
