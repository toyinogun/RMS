import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { getProperty } from '@solutio/db/properties-service';
import { type Kobo } from '@solutio/shared/money';
import { PropertyForm } from '@/components/properties/property-form';
import { updatePropertyAction } from '@/server-actions/properties/update';
import type { PropertyActionState } from '@/server-actions/properties/create';

export const dynamic = 'force-dynamic';

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { id } = await params;
  const property = await getProperty(ctx, id);
  if (!property) notFound();

  async function handleSubmit(fd: FormData): Promise<PropertyActionState> {
    'use server';
    return updatePropertyAction(null, fd);
  }

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit property</h1>
        <Link href={`/properties/${property.id}` as Route} className="text-sm text-slate-600 hover:underline">
          Cancel
        </Link>
      </header>
      <PropertyForm
        mode="edit"
        variant="page"
        initial={{ ...property, totalPriceKobo: property.totalPriceKobo as Kobo }}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
