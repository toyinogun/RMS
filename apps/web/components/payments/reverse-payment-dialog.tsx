'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { formatKobo } from '@solutio/shared/money';
import type { PaymentMethod } from '@solutio/shared/payments';
import {
  reversePaymentAction,
  type PaymentReverseState,
} from '@/server-actions/payments/reverse';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type ReversePaymentDialogProps = {
  payment: {
    id: string;
    amountKobo: bigint;
    paidAt: Date;
    method: PaymentMethod;
    allocations: Array<{ installmentSequenceNo: number; amountKobo: bigint }>;
  };
  planId: string;
  planCurrentlyCompleted: boolean;
  trigger: React.ReactNode;
};

export function ReversePaymentDialog({
  payment,
  planId,
  planCurrentlyCompleted,
  trigger,
}: ReversePaymentDialogProps) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState<PaymentReverseState | undefined, FormData>(
    reversePaymentAction,
    undefined,
  );

  // Watch state for terminal outcomes and show toasts / close dialog.
  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success('Payment reversed.');
      setOpen(false);
    } else {
      toast.error(state.message);
      // Dialog remains open on error — user must dismiss it.
    }
  }, [state]);

  // Format the reversal amount as negative (the reversal is negative in the ledger).
  const absAmountKobo = payment.amountKobo < 0n ? -payment.amountKobo : payment.amountKobo;
  const formattedAmount = formatKobo(absAmountKobo as Parameters<typeof formatKobo>[0]);
  const formattedNegAmount = `-${formattedAmount}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payment of {formattedAmount}</DialogTitle>
        </DialogHeader>

        <form action={formAction}>
          {/* Hidden inputs required by the server action */}
          <input type="hidden" name="paymentId" value={payment.id} />
          <input type="hidden" name="planId" value={planId} />

          {/* Consequences preview */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              The following changes will be made:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                A new reversal payment of{' '}
                <span className="font-mono text-foreground">{formattedNegAmount}</span>{' '}
                will be recorded.
              </li>
              {payment.allocations.map((alloc) => (
                <li key={alloc.installmentSequenceNo}>
                  Installment #{alloc.installmentSequenceNo}:{' '}
                  <span className="font-mono text-foreground">
                    {formatKobo(
                      (alloc.amountKobo < 0n
                        ? -alloc.amountKobo
                        : alloc.amountKobo) as Parameters<typeof formatKobo>[0],
                    )}
                  </span>{' '}
                  will be unallocated.
                </li>
              ))}
              {planCurrentlyCompleted && (
                <li className="text-status-overdue font-medium">
                  The plan will reopen (COMPLETED → ACTIVE).
                </li>
              )}
              <li className="text-muted-foreground/70 italic">
                The property&apos;s status is not affected by reversal. If the buyer is
                walking away, an admin must update the property separately.
              </li>
              <li className="text-muted-foreground/70 italic">
                Reversals cannot themselves be reversed. If you reverse by mistake, record
                a fresh payment.
              </li>
            </ul>
          </div>

          {/* Reason textarea */}
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={500}
              rows={3}
              placeholder="Optional reason for this reversal"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Stored on the audit trail.
            </p>
          </div>

          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? 'Reversing…' : 'Reverse'}
    </Button>
  );
}
