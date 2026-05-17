import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { listUsers } from '@solutio/db';
import { Button } from '@/components/ui/button';
import { UsersTable } from '@/components/users/users-table';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const users = await listUsers(ctx);

  const activeOwners = users.filter(
    (u) => u.role === 'OWNER' && u.deactivatedAt === null,
  );
  const lastActiveOwnerId = activeOwners.length === 1 ? (activeOwners[0]?.id ?? null) : null;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button asChild>
          <Link href="/users/new">New user</Link>
        </Button>
      </header>
      {users.length === 0 ? (
        <p className="text-sm text-slate-500">No users yet. Add the first one.</p>
      ) : (
        <UsersTable
          rows={users}
          currentUserId={ctx.user.id}
          lastActiveOwnerId={lastActiveOwnerId}
        />
      )}
    </section>
  );
}
