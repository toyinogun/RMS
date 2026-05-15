import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@solutio/db/client';
import { listProperties } from '@solutio/db/properties-service';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

type PropertyStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';

function statusBadgeVariant(
  status: PropertyStatus,
): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'AVAILABLE':
      return 'default';
    case 'RESERVED':
      return 'secondary';
    case 'SOLD':
      return 'outline';
  }
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { q, status } = await searchParams;
  const validStatus =
    status === 'AVAILABLE' || status === 'RESERVED' || status === 'SOLD' ? status : undefined;
  const properties = await listProperties(prisma, ctx, { search: q, status: validStatus });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Properties</h1>
        <Button asChild>
          <Link href={'/properties/new' as Route}>New property</Link>
        </Button>
      </header>
      <form className="flex gap-2" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search code, title, city"
          className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Select name="status" defaultValue={status ?? 'ALL'}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="AVAILABLE">AVAILABLE</SelectItem>
            <SelectItem value="RESERVED">RESERVED</SelectItem>
            <SelectItem value="SOLD">SOLD</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Total price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-slate-500">
                No properties yet.
              </TableCell>
            </TableRow>
          ) : (
            properties.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/properties/${p.id}` as Route} className="text-slate-900 hover:underline">
                    {p.code}
                  </Link>
                </TableCell>
                <TableCell>{p.title}</TableCell>
                <TableCell>{p.city}</TableCell>
                <TableCell>{formatKobo(p.totalPriceKobo as Kobo)}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(p.status as PropertyStatus)}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell>{p.createdAt.toISOString().slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/properties/${p.id}/edit` as Route} className="text-sm text-slate-600 hover:underline">
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
