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
      <p className="mt-4 text-sm text-slate-600">
        Phase 0 is a foundation deploy — the customer, property, plan, and payment UIs
        land in Phase 1.
      </p>
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
