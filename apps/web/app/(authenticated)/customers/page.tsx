import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@solutio/db/client';
import { listCustomers } from '@solutio/db/customers-service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  const { q } = await searchParams;
  const customers = await listCustomers(prisma, ctx, { search: q });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button asChild>
          <Link href="/customers/new">New customer</Link>
        </Button>
      </header>
      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name, phone, email"
          className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                No customers yet.
              </TableCell>
            </TableRow>
          ) : (
            customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/customers/${c.id}`} className="text-slate-900 hover:underline">
                    {c.fullName}
                  </Link>
                </TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>{c.createdAt.toISOString().slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/customers/${c.id}/edit`} className="text-sm text-slate-600 hover:underline">
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
