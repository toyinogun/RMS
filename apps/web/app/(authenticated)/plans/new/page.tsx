import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import { listCustomers } from '@solutio/db/customers-service';
import { listProperties } from '@solutio/db/properties-service';
import type { Kobo } from '@solutio/shared/money';
import { BuyerOnboardingWizard } from '@/components/plans/buyer-onboarding-wizard';

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
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-ink-900 sm:text-2xl">
          New sale
        </h1>
        <p className="text-sm text-ink-500">
          Record a buyer, a property, and the installment plan they&rsquo;ve agreed to.
        </p>
      </header>
      <BuyerOnboardingWizard
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
