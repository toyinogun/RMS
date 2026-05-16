import { formatKobo, type Kobo } from '@solutio/shared/money';
import type { PaymentListRow, PlanStatus } from '@solutio/db/payments-service';
import type { UserRole } from '@solutio/shared/tenant';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReversePaymentDialog } from '@/components/payments/reverse-payment-dialog';

export interface PaymentsListProps {
  payments: PaymentListRow[];
  userRole: UserRole;
  planStatus: PlanStatus;
  planId: string;
}

const EM_DASH = '—';

/**
 * Server-renderable list of payments for a plan. Allocations are exposed via a
 * `<details>` element so expand/collapse works without client-side JS.
 *
 * Parent is responsible for ordering. We render whatever order we get.
 *
 * Accepts `userRole`, `planStatus`, and `planId` to gate the Reverse action:
 * - Only OWNER and ADMIN roles can see the Reverse button.
 * - Reversal rows (reversedById !== null) and already-reversed rows
 *   (reversedByPaymentId !== null) never show the Reverse button.
 */
export function PaymentsList({ payments, userRole, planStatus, planId }: PaymentsListProps) {
  const canReverseForRole = userRole === 'OWNER' || userRole === 'ADMIN';
  const planCurrentlyCompleted = planStatus === 'COMPLETED';

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
          {canReverseForRole ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => {
          const isReversalRow = p.reversedById !== null;
          const wasReversed = p.reversedByPaymentId !== null;
          const canReverse = canReverseForRole && !isReversalRow && !wasReversed;

          // Reversal rows carry a negative amountKobo — display as -₦X.XX in red.
          const absKobo = p.amountKobo < 0n ? (-p.amountKobo as Kobo) : (p.amountKobo as Kobo);
          const amountDisplay = isReversalRow ? (
            <span className="text-status-overdue">-{formatKobo(absKobo)}</span>
          ) : (
            formatKobo(p.amountKobo as Kobo)
          );

          return (
            <TableRow key={p.id}>
              <TableCell>{p.paidAt.toISOString().slice(0, 10)}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  {amountDisplay}
                  {wasReversed && (
                    <Badge variant="destructive">Reversed</Badge>
                  )}
                  {isReversalRow && (
                    <Badge variant="outline">Reversal</Badge>
                  )}
                </span>
              </TableCell>
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
              {canReverseForRole ? (
                <TableCell>
                  {canReverse ? (
                    <ReversePaymentDialog
                      trigger={
                        <Button variant="ghost" size="sm" data-testid="reverse-payment">
                          Reverse
                        </Button>
                      }
                      payment={{
                        id: p.id,
                        amountKobo: p.amountKobo,
                        paidAt: p.paidAt,
                        method: p.method,
                        allocations: p.allocations.map((a) => ({
                          installmentSequenceNo: a.installmentSequenceNo,
                          amountKobo: a.amountKobo,
                        })),
                      }}
                      planId={planId}
                      planCurrentlyCompleted={planCurrentlyCompleted}
                    />
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
