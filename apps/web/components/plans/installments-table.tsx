import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface InstallmentRow {
  id: string;
  sequenceNo: number;
  dueDate: Date;
  amountDueKobo: bigint;
  amountPaidKobo: bigint;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
}

const statusVariant: Record<
  InstallmentRow['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  PARTIAL: 'secondary',
  PAID: 'default',
  OVERDUE: 'destructive',
  WAIVED: 'outline',
};

export function InstallmentsTable({ installments }: { installments: InstallmentRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Due date</TableHead>
          <TableHead>Amount due</TableHead>
          <TableHead>Paid</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {installments.map((i) => {
          const balance = i.amountDueKobo - i.amountPaidKobo;
          return (
            <TableRow key={i.id}>
              <TableCell>{i.sequenceNo}</TableCell>
              <TableCell>{i.dueDate.toISOString().slice(0, 10)}</TableCell>
              <TableCell>{formatKobo(i.amountDueKobo as Kobo)}</TableCell>
              <TableCell>{formatKobo(i.amountPaidKobo as Kobo)}</TableCell>
              <TableCell>{formatKobo(balance as Kobo)}</TableCell>
              <TableCell>
                <Badge variant={statusVariant[i.status]}>{i.status}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
