import Link from 'next/link';
import type { Route } from 'next';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import type { RecentActivityRow } from '@solutio/db/dashboard-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RecentActivityTableProps {
  rows: ReadonlyArray<RecentActivityRow>;
}

const whenFormatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Server-rendered table of recent Payment rows. Reversal rows render with a
 * negative amount and a leading ↩ marker; both are derived from
 * `RecentActivityRow.isReversal`, which the dashboard service derives from
 * `Payment.reversedById`. Empty state shown when `rows` is empty.
 *
 * Link target uses an anchor (`#payment-{id}`) inside the plan-detail page's
 * Payments tab. Anchor scroll is best-effort — Phase 1a has no dedicated
 * payment-detail page; if the tab isn't pre-selected on the destination,
 * the anchor won't scroll. Acceptable trade-off; revisit in M8 if users complain.
 */
export function RecentActivityTable({ rows }: RecentActivityTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-paper-300 bg-paper-50 p-6 text-center text-sm text-ink-500">
        No payments yet. Activity will appear here as your team records collections.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Property</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const amountClass = row.isReversal ? 'text-destructive' : 'text-ink-900';
          const href = `/plans/${row.planId}?tab=payments#payment-${row.id}` as Route;

          return (
            <TableRow key={row.id}>
              <TableCell>{whenFormatter.format(row.paidAt)}</TableCell>
              <TableCell>{row.customerName}</TableCell>
              <TableCell>{row.propertyCode}</TableCell>
              <TableCell>{row.method}</TableCell>
              <TableCell className={amountClass}>
                {row.isReversal ? '↩ ' : ''}
                {formatKobo(row.amountKobo as Kobo)}
              </TableCell>
              <TableCell>
                <Link href={href} className="text-sm text-clay-600 hover:underline">
                  View →
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
