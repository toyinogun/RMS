import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (ctx.user.mustChangePassword) redirect('/onboarding/change-password');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 px-6 py-3 text-sm">
        Signed in as <span className="font-medium">{ctx.user.email}</span>
      </header>
      {children}
    </div>
  );
}
