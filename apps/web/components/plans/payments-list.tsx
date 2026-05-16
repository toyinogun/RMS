import { formatKobo, type Kobo } from '@solutio/shared/money';
import type { PaymentListRow } from '@solutio/db/payments-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface PaymentsListProps {
  payments: PaymentListRow[];
}

const EM_DASH = '—';

/**
 * Server-renderable list of payments for a plan. Allocations are exposed via a
 * `<details>` element so expand/collapse works without client-side JS.
 *
 * Parent is responsible for ordering. We render whatever order we get.
 */
export function PaymentsList({ payments }: PaymentsListProps) {
  if (payments.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-slate-600">
        No payments recorded yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paid date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Recorded by</TableHead>
          <TableHead>Allocations</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell>{p.paidAt.toISOString().slice(0, 10)}</TableCell>
            <TableCell>{formatKobo(p.amountKobo as Kobo)}</TableCell>
            <TableCell>{p.method}</TableCell>
            <TableCell>{p.reference ?? EM_DASH}</TableCell>
            <TableCell>{p.recordedByName ?? EM_DASH}</TableCell>
            <TableCell>
              <details>
                <summary className="cursor-pointer text-sm text-slate-700">
                  {p.allocations.length}{' '}
                  {p.allocations.length === 1 ? 'installment' : 'installments'}
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {p.allocations.map((a) => (
                    <li key={a.id}>
                      Installment #{a.installmentSequenceNo} —{' '}
                      {formatKobo(a.amountKobo as Kobo)}
                    </li>
                  ))}
                </ul>
              </details>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
