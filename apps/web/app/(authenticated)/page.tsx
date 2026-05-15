import Link from 'next/link';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { signOutAction } from '@/server-actions/sign-out';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Welcome to Solutio</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as <span className="font-medium">{ctx.user.email}</span> ({ctx.user.role}).
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <Link
          href={'/customers' as Route}
          className="rounded border border-slate-200 p-4 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          <h2 className="font-semibold text-slate-900">Customers</h2>
          <p className="mt-1 text-sm text-slate-600">Manage customer profiles</p>
        </Link>
        <Link
          href={'/properties' as Route}
          className="rounded border border-slate-200 p-4 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          <h2 className="font-semibold text-slate-900">Properties</h2>
          <p className="mt-1 text-sm text-slate-600">Manage property listings</p>
        </Link>
      </div>

      <form action={signOutAction} className="mt-8">
        <button
          type="submit"
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
