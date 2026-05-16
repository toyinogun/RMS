'use client';

import * as React from 'react';
import {
  Controller,
  useForm,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { formatKobo, parseNgn, type Kobo } from '@solutio/shared/money';
import {
  allocatePayment,
  paymentRecordSchema,
  type PaymentMethod,
} from '@solutio/shared/payments';
import type { InstallmentStatus } from '@solutio/shared/installments';
import type { PaymentRecordState } from '@/server-actions/payments/record';
import { PAYMENT_RETRY_FAILURE_MESSAGE } from '@/server-actions/payments/messages';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoneyInput } from '@/components/plans/money-input';
import { cn } from '@/lib/utils';

// Status -> badge variant for the plan context strip.
type PlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
const planStatusVariant: Record<
  PlanStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  COMPLETED: 'secondary',
  DEFAULTED: 'destructive',
  CANCELLED: 'outline',
};

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'TRANSFER',
  'CHEQUE',
  'CARD_MANUAL',
  'OTHER',
] as const;

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  TRANSFER: 'Transfer',
  CHEQUE: 'Cheque',
  CARD_MANUAL: 'Card (manual)',
  OTHER: 'Other',
};

export interface PaymentFormPlan {
  id: string;
  customerName: string;
  propertyCode: string;
  totalPriceKobo: Kobo;
  outstandingKobo: Kobo;
  status: PlanStatus;
}

export interface PaymentFormInstallment {
  id: string;
  sequenceNo: number;
  dueDate: Date;
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
  status: InstallmentStatus;
}

export interface PaymentFormProps {
  plan: PaymentFormPlan;
  installments: PaymentFormInstallment[];
  onSubmit: (formData: FormData) => Promise<PaymentRecordState>;
}

type AllocationRowValue = {
  installmentId: string;
  amountNgn: string;
  sequenceNo: number;
  outstandingKobo: Kobo;
  dueDate: Date;
};

type FormValues = {
  planId: string;
  amountNgn: string;
  paidAt: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  allocationMode: 'auto' | 'manual';
  allocations: AllocationRowValue[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function tryParseNgn(raw: string): Kobo {
  try {
    return parseNgn(raw);
  } catch {
    return 0n as Kobo;
  }
}

function koboToNgnInputString(kobo: Kobo): string {
  if (kobo <= 0n) return '0';
  const naira = kobo / 100n;
  const remainder = kobo % 100n;
  if (remainder === 0n) {
    return new Intl.NumberFormat('en-NG').format(Number(naira));
  }
  return `${new Intl.NumberFormat('en-NG').format(Number(naira))}.${remainder
    .toString()
    .padStart(2, '0')}`;
}

function formatDateNg(date: Date): string {
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function PaymentForm({ plan, installments, onSubmit }: PaymentFormProps) {
  const router = useRouter();

  const nonPaidInstallments = React.useMemo(
    () => installments.filter((i) => i.status !== 'PAID'),
    [installments],
  );

  const allocationDefaults = React.useMemo<AllocationRowValue[]>(
    () =>
      nonPaidInstallments.map((i) => ({
        installmentId: i.id,
        amountNgn: '0',
        sequenceNo: i.sequenceNo,
        outstandingKobo: (i.amountDueKobo - i.amountPaidKobo) as Kobo,
        dueDate: i.dueDate,
      })),
    [nonPaidInstallments],
  );

  const form = useForm<FormValues>({
    // We run paymentRecordSchema manually inside the submit handler — the
    // shared zod schema transforms keys (amountNgn → amountKobo) which
    // doesn't round-trip cleanly through zodResolver's FormValues<->output
    // mapping. Manual validation lets us drop the UI-only allocations array
    // in auto mode and zero-rows in manual mode before validating.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      planId: plan.id,
      amountNgn: '',
      paidAt: todayIso(),
      method: 'CASH',
      reference: '',
      notes: '',
      allocationMode: 'auto',
      allocations: allocationDefaults,
    },
  });

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
    control,
  } = form;

  const { fields, update: updateAllocation } = useFieldArray({
    control,
    name: 'allocations',
  });

  const amountNgn = useWatch({ control, name: 'amountNgn' });
  const allocationMode = useWatch({ control, name: 'allocationMode' });
  const watchedAllocations = useWatch({ control, name: 'allocations' });

  const amountKobo = React.useMemo(
    () => tryParseNgn(amountNgn) as Kobo,
    [amountNgn],
  );

  // Live FIFO preview, recomputed whenever amount or installments change.
  const preview = React.useMemo(() => {
    if (amountKobo <= 0n) return null;
    if (nonPaidInstallments.length === 0) {
      return { allocations: [], remainderKobo: amountKobo };
    }
    return allocatePayment(
      amountKobo,
      nonPaidInstallments.map((i) => ({
        id: i.id,
        sequenceNo: i.sequenceNo,
        amountDueKobo: i.amountDueKobo,
        amountPaidKobo: i.amountPaidKobo,
      })),
    );
  }, [amountKobo, nonPaidInstallments]);

  // When the clerk flips into manual mode for the FIRST time, pre-fill rows
  // with the current FIFO suggestion. Subsequent auto→manual transitions
  // preserve whatever the clerk last edited — values are simply omitted from
  // FormData in auto mode and re-appear unchanged when manual is re-selected.
  const prevModeRef = React.useRef<'auto' | 'manual'>(allocationMode);
  const hasPrefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (
      prevModeRef.current === 'auto' &&
      allocationMode === 'manual' &&
      !hasPrefilledRef.current
    ) {
      const suggestion: Record<string, Kobo> = {};
      if (preview) {
        for (const a of preview.allocations) {
          suggestion[a.installmentId] = a.amountKobo;
        }
      }
      const current = getValues('allocations');
      current.forEach((row, idx) => {
        const kobo = suggestion[row.installmentId] ?? (0n as Kobo);
        // useFieldArray.update replaces the row in form state AND re-keys
        // the field — calling setValue alone updates the DOM input but
        // leaves `watch('allocations')` stale until the next user keystroke.
        updateAllocation(idx, { ...row, amountNgn: koboToNgnInputString(kobo) });
      });
      hasPrefilledRef.current = true;
    }
    prevModeRef.current = allocationMode;
  }, [allocationMode, preview, getValues, updateAllocation]);

  const allocatedSumKobo = React.useMemo(() => {
    if (allocationMode !== 'manual') return 0n as Kobo;
    let sum = 0n;
    for (const row of watchedAllocations ?? []) {
      sum += tryParseNgn(row.amountNgn);
    }
    return sum as Kobo;
  }, [allocationMode, watchedAllocations]);

  const unallocatedKobo = (amountKobo - allocatedSumKobo) as Kobo;
  const manualImbalanced =
    allocationMode === 'manual' && unallocatedKobo !== 0n;

  const totalOutstandingKobo = React.useMemo(
    () => nonPaidInstallments.reduce(
      (acc, i) => (acc + (i.amountDueKobo - i.amountPaidKobo)) as Kobo,
      0n as Kobo,
    ),
    [nonPaidInstallments],
  );
  const overpayBy = amountKobo > totalOutstandingKobo
    ? ((amountKobo - totalOutstandingKobo) as Kobo)
    : (0n as Kobo);

  const previewRowAmount = (installmentId: string): Kobo => {
    if (!preview) return 0n as Kobo;
    const hit = preview.allocations.find((a) => a.installmentId === installmentId);
    return (hit?.amountKobo ?? 0n) as Kobo;
  };

  const onValidSubmit = handleSubmit(async (values) => {
    // Run the shared zod schema against the same shape we'll send to the
    // server. Drops the always-present UI rows in auto mode and any zero
    // rows in manual mode before validating.
    const candidate: Record<string, unknown> = {
      planId: values.planId,
      amountNgn: values.amountNgn,
      paidAt: values.paidAt,
      method: values.method,
      reference: values.reference?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
    };
    let manualRows: Array<{ installmentId: string; amountNgn: string }> = [];
    if (values.allocationMode === 'manual') {
      manualRows = values.allocations
        .filter((r) => tryParseNgn(r.amountNgn) > 0n)
        .map((r) => ({ installmentId: r.installmentId, amountNgn: r.amountNgn }));
      if (manualRows.length > 0) {
        candidate.allocations = manualRows;
      }
    }
    const parsed = paymentRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (path.startsWith('allocations.')) {
          const parts = issue.path;
          if (parts.length >= 2 && typeof parts[1] === 'number') {
            setError(`allocations.${parts[1]}.amountNgn` as never, {
              message: issue.message,
            });
            continue;
          }
        }
        setError((path || 'amountNgn') as keyof FormValues, {
          message: issue.message,
        });
      }
      return;
    }

    const fd = new FormData();
    fd.append('planId', values.planId);
    fd.append('amountNgn', values.amountNgn);
    fd.append('paidAt', values.paidAt);
    fd.append('method', values.method);
    if (values.reference.trim()) fd.append('reference', values.reference.trim());
    if (values.notes.trim()) fd.append('notes', values.notes.trim());
    manualRows.forEach((row, idx) => {
      fd.append(`allocations[${idx}].installmentId`, row.installmentId);
      fd.append(`allocations[${idx}].amountNgn`, row.amountNgn);
    });

    const result = await onSubmit(fd);

    if (result.ok) {
      toast.success('Payment recorded');
      router.push(`/plans/${plan.id}` as Route);
      router.refresh();
      return;
    }

    // Concurrent-update retry exhaustion: surface but do not redirect.
    if (result.message === PAYMENT_RETRY_FAILURE_MESSAGE) {
      toast.error(result.message);
      return;
    }

    if (result.fieldErrors) {
      for (const [path, message] of Object.entries(result.fieldErrors)) {
        // Map server field paths back to form field names. The schema produces
        // either flat names (amountNgn, paidAt, planId, method, reference, notes)
        // or per-row paths (allocations.N.amountNgn).
        if (path.startsWith('allocations.')) {
          const parts = path.split('.');
          if (parts.length >= 2) {
            const idx = Number(parts[1]);
            if (Number.isFinite(idx)) {
              setError(`allocations.${idx}.amountNgn` as never, { message });
              continue;
            }
          }
        }
        setError(path as keyof FormValues, { message });
      }
      // If a field-level error fired, show its message via inline UI;
      // otherwise also surface message as toast.
      if (result.message && Object.keys(result.fieldErrors).length === 0) {
        toast.error(result.message);
      }
      return;
    }

    toast.error(result.message);
  });

  const submitDisabled = isSubmitting || manualImbalanced;

  return (
    <form onSubmit={onValidSubmit} noValidate className="space-y-6">
      {/* 1. Plan context strip */}
      <section
        aria-label="Plan context"
        className="rounded-lg border border-paper-300 bg-paper-50 px-5 py-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              Recording payment for
            </p>
            <p className="mt-1 text-[15px] font-semibold text-ink-900">
              {plan.customerName}{' '}
              <span className="text-ink-500">· {plan.propertyCode}</span>
            </p>
          </div>
          <Badge variant={planStatusVariant[plan.status]}>{plan.status}</Badge>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              Plan total
            </dt>
            <dd data-money className="text-[14px] font-medium text-ink-900">
              {formatKobo(plan.totalPriceKobo)}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              Outstanding
            </dt>
            <dd data-money className="text-[14px] font-medium text-ink-900">
              {formatKobo(plan.outstandingKobo)}
            </dd>
          </div>
        </dl>
      </section>

      <input type="hidden" {...register('planId')} />

      {/* 2. Amount */}
      <div className="space-y-1.5">
        <Label htmlFor="amountNgn" className="text-ink-700">
          Amount <span className="ml-1 text-clay-600">*</span>
        </Label>
        <MoneyInput
          id="amountNgn"
          placeholder="100,000"
          invalid={!!errors.amountNgn}
          aria-required="true"
          {...register('amountNgn')}
        />
        {errors.amountNgn && (
          <FieldError>{errors.amountNgn.message as string}</FieldError>
        )}
        {overpayBy > 0n && !errors.amountNgn && (
          <p data-money className="text-[13px] text-status-overdue">
            Overpays by {formatKobo(overpayBy)} — server will reject.
          </p>
        )}
      </div>

      {/* 3. Date */}
      <div className="space-y-1.5">
        <Label htmlFor="paidAt" className="text-ink-700">
          Payment date <span className="ml-1 text-clay-600">*</span>
        </Label>
        <Input
          id="paidAt"
          type="date"
          className="bg-paper-50 font-mono"
          aria-invalid={!!errors.paidAt}
          {...register('paidAt')}
        />
        {errors.paidAt && (
          <FieldError>{errors.paidAt.message as string}</FieldError>
        )}
      </div>

      {/* 4. Method */}
      <div className="space-y-1.5">
        <Label htmlFor="method" className="text-ink-700">
          Method <span className="ml-1 text-clay-600">*</span>
        </Label>
        <select
          id="method"
          aria-invalid={!!errors.method}
          className="h-10 w-full rounded-md border border-paper-400 bg-paper-50 px-3 text-sm text-ink-900 outline-none focus:border-clay-600 focus:ring-[3px] focus:ring-clay-600/25"
          {...register('method')}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        {errors.method && (
          <FieldError>{errors.method.message as string}</FieldError>
        )}
      </div>

      {/* 5. Reference / Notes (collapsed) */}
      <details className="rounded-md border border-paper-300 bg-paper-50 px-4 py-3 open:pb-4">
        <summary className="cursor-pointer text-sm font-medium text-ink-700 outline-none focus-visible:underline">
          Add reference &amp; notes
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reference" className="text-ink-700">
              Reference
            </Label>
            <Input
              id="reference"
              type="text"
              placeholder="Transfer reference, cheque #, etc."
              aria-invalid={!!errors.reference}
              {...register('reference')}
            />
            {errors.reference && (
              <FieldError>{errors.reference.message as string}</FieldError>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-ink-700">
              Notes
            </Label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Anything you want recorded against this payment"
              className="w-full rounded-md border border-paper-400 bg-paper-50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-clay-600 focus:ring-[3px] focus:ring-clay-600/25"
              aria-invalid={!!errors.notes}
              {...register('notes')}
            />
            {errors.notes && (
              <FieldError>{errors.notes.message as string}</FieldError>
            )}
          </div>
        </div>
      </details>

      {/* 6. Allocation block */}
      <section aria-label="Allocation" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
            Allocation
          </h3>
          <fieldset className="inline-flex rounded-md border border-paper-300 bg-paper-100 p-1">
            <legend className="sr-only">Allocation mode</legend>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors',
                allocationMode === 'auto'
                  ? 'bg-paper-50 text-ink-900 shadow-[0_1px_0_oklch(0.91_0.01_50/0.5)]'
                  : 'text-ink-500 hover:text-ink-700',
              )}
            >
              <input
                type="radio"
                value="auto"
                className="sr-only"
                checked={allocationMode === 'auto'}
                onChange={() => setValue('allocationMode', 'auto')}
              />
              Auto (FIFO)
            </label>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors',
                allocationMode === 'manual'
                  ? 'bg-paper-50 text-ink-900 shadow-[0_1px_0_oklch(0.91_0.01_50/0.5)]'
                  : 'text-ink-500 hover:text-ink-700',
              )}
            >
              <input
                type="radio"
                value="manual"
                className="sr-only"
                checked={allocationMode === 'manual'}
                onChange={() => setValue('allocationMode', 'manual')}
              />
              Manual override
            </label>
          </fieldset>
        </div>

        {nonPaidInstallments.length === 0 ? (
          <p className="text-sm text-ink-500">
            This plan has no outstanding installments.
          </p>
        ) : amountKobo <= 0n && allocationMode === 'auto' ? (
          <p className="text-sm text-ink-500">
            Enter an amount to preview how it will be allocated.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-paper-300">
            <table
              className="w-full text-sm"
              aria-label={
                allocationMode === 'auto'
                  ? 'FIFO allocation preview'
                  : 'Manual allocation editor'
              }
            >
              <thead>
                <tr className="border-b border-paper-400 bg-paper-100 text-left">
                  <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                    #
                  </th>
                  <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                    Due
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                    Outstanding
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                    This payment
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                    After this
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const outstanding = field.outstandingKobo as Kobo;
                  const thisPaymentKobo =
                    allocationMode === 'manual'
                      ? tryParseNgn(watchedAllocations?.[idx]?.amountNgn ?? '0')
                      : previewRowAmount(field.installmentId);
                  const afterKobo = (outstanding - thisPaymentKobo) as Kobo;
                  const dim = thisPaymentKobo <= 0n && allocationMode === 'auto';
                  const rowError =
                    errors.allocations?.[idx]?.amountNgn?.message as
                      | string
                      | undefined;
                  return (
                    <tr
                      key={field.id}
                      className={cn(
                        'border-b border-paper-300 last:border-b-0',
                        dim && 'opacity-50',
                      )}
                      data-testid={`allocation-row-${idx}`}
                    >
                      <td className="px-3 py-2 text-[13px] text-ink-700">
                        {field.sequenceNo}
                      </td>
                      <td data-money className="px-3 py-2 text-[13px] text-ink-700">
                        {formatDateNg(field.dueDate)}
                      </td>
                      <td
                        data-money
                        className="px-3 py-2 text-right text-[13px] text-ink-700"
                      >
                        {formatKobo(outstanding)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {allocationMode === 'manual' ? (
                          <div className="space-y-1">
                            <Controller
                              control={control}
                              name={`allocations.${idx}.amountNgn`}
                              render={({ field: ctrl }) => (
                                <MoneyInput
                                  aria-label={`Allocation for installment ${field.sequenceNo}`}
                                  invalid={!!rowError}
                                  value={ctrl.value}
                                  onChange={(e) =>
                                    ctrl.onChange(e.currentTarget.value)
                                  }
                                  onBlur={ctrl.onBlur}
                                  name={ctrl.name}
                                  ref={ctrl.ref}
                                />
                              )}
                            />
                            {rowError && (
                              <p className="text-[12px] text-status-overdue">
                                {rowError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span
                            data-money
                            className="text-[13px] font-medium text-ink-900"
                          >
                            {formatKobo(thisPaymentKobo)}
                          </span>
                        )}
                      </td>
                      <td
                        data-money
                        className={cn(
                          'px-3 py-2 text-right text-[13px]',
                          afterKobo < 0n ? 'text-status-overdue' : 'text-ink-700',
                        )}
                      >
                        {formatKobo(afterKobo as Kobo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {allocationMode === 'manual' && nonPaidInstallments.length > 0 && (
          <div
            data-testid="manual-balance-strip"
            className={cn(
              'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
              unallocatedKobo === 0n
                ? 'border-status-paid/30 bg-status-paid/10 text-status-paid'
                : 'border-status-overdue/30 bg-status-overdue/10 text-status-overdue',
            )}
          >
            <span data-money>
              Allocated:{' '}
              <span className="font-medium">{formatKobo(allocatedSumKobo)}</span>
            </span>
            <span data-money>
              Unallocated:{' '}
              <span className="font-medium">
                {unallocatedKobo < 0n
                  ? `−${formatKobo((-unallocatedKobo) as Kobo)}`
                  : formatKobo(unallocatedKobo)}
              </span>
            </span>
          </div>
        )}

        {allocationMode === 'auto' &&
          preview &&
          preview.remainderKobo > 0n && (
            <p
              data-money
              className="flex items-start gap-1 text-[13px] text-status-overdue"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>
                Overpays by {formatKobo(preview.remainderKobo)} — server will
                reject.
              </span>
            </p>
          )}
      </section>

      {/* 7. Submit / Cancel */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={submitDisabled}>
          {isSubmitting ? 'Recording…' : 'Record payment'}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/plans/${plan.id}` as Route}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1 text-[13px] text-status-overdue">
      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
