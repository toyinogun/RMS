import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  // Intentional: this layout does NOT enforce the mustChangePassword gate —
  // /onboarding/change-password is the destination of that redirect.
  return <div className="min-h-screen">{children}</div>;
}
