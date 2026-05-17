import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'OWNER') redirect('/');
  return <>{children}</>;
}
