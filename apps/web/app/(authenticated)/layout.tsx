import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SiteNav } from '@/components/site-nav';
import { Toaster } from '@/components/ui/sonner';
import { getTenantContext } from '@/lib/tenant-context';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (ctx.user.mustChangePassword) redirect('/onboarding/change-password');

  const hdrs = await headers();
  const currentPath = hdrs.get('x-pathname') ?? '/';

  return (
    <div className="min-h-screen bg-paper-50 text-ink-900">
      <SiteNav currentPath={currentPath} userEmail={ctx.user.email} role={ctx.user.role} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <Toaster />
    </div>
  );
}
