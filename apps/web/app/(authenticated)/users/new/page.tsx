import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant-context';
import { NewUserForm } from '@/components/users/new-user-form';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  // OWNER gate is enforced by parent layout; no role check needed here.

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New user</h1>
        <Link href="/users" className="text-sm text-slate-600 hover:underline">Cancel</Link>
      </header>
      <NewUserForm />
    </section>
  );
}
