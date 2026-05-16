'use client';

import * as React from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Search,
  UserPlus,
  AlertTriangle,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import { formatKobo, parseNgn, type Kobo } from '@solutio/shared/money';
import { generateSchedule } from '@solutio/shared/installments';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createPlanAction, type PlanCreateState } from '@/server-actions/plans/create';
import { cn } from '@/lib/utils';
import { MoneyInput } from './money-input';
import { WizardProgressRail } from './wizard-progress-rail';

export interface CustomerOption {
  id: string;
  fullName: string;
  phone: string;
}

export interface PropertyOption {
  id: string;
  code: string;
  title: string;
  addressLine: string;
  totalPriceKobo: Kobo;
}

interface BuyerOnboardingWizardProps {
  customers: CustomerOption[];
  properties: PropertyOption[];
}

type DepositMethod = 'CASH' | 'TRANSFER' | 'CHEQUE' | 'CARD_MANUAL' | 'OTHER';

const DEPOSIT_METHODS: readonly DepositMethod[] = [
  'CASH',
  'TRANSFER',
  'CHEQUE',
  'CARD_MANUAL',
  'OTHER',
] as const;

const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = {
  CASH: 'Cash',
  TRANSFER: 'Transfer',
  CHEQUE: 'Cheque',
  CARD_MANUAL: 'Card (manual)',
  OTHER: 'Other',
};

type FormValues = {
  customerMode: 'existing' | 'new';
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  customerEmail: string;
  customerNationalId: string;
  customerNotes: string;
  propertyId: string;
  totalPriceNgn: string;
  depositNgn: string;
  monthlyNgn: string;
  termMonths: number;
  startDate: string;
  depositReceived: boolean;
  depositMethod: DepositMethod;
  depositPaidAt: string;
  depositReference: string;
  depositNotes: string;
};

const STEPS = [
  { key: 'buyer', title: 'Buyer' },
  { key: 'property', title: 'Property' },
  { key: 'terms', title: 'Terms' },
  { key: 'review', title: 'Review' },
] as const;

const CTA_BY_STEP = ['Continue', 'Continue', 'Preview schedule', 'Confirm sale'] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function BuyerOnboardingWizard({ customers, properties }: BuyerOnboardingWizardProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [serverBanner, setServerBanner] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      customerMode: customers.length > 0 ? 'existing' : 'new',
      customerId: '',
      customerFullName: '',
      customerPhone: '',
      customerEmail: '',
      customerNationalId: '',
      customerNotes: '',
      propertyId: '',
      totalPriceNgn: '',
      depositNgn: '0',
      monthlyNgn: '',
      termMonths: 24,
      startDate: todayIso(),
      depositReceived: false,
      depositMethod: 'CASH',
      depositPaidAt: '',
      depositReference: '',
      depositNotes: '',
    },
  });

  const isLastStep = stepIndex === STEPS.length - 1;
  const isFirstStep = stepIndex === 0;

  // Any form change invalidates the last server / cross-field banner —
  // a stale banner sitting alongside corrected inputs is the wrong signal.
  React.useEffect(() => {
    const sub = form.watch(() => setServerBanner(null));
    return () => sub.unsubscribe();
  }, [form]);

  const validateCurrentStep = async (): Promise<boolean> => {
    const v = form.getValues();
    form.clearErrors();
    setServerBanner(null);

    if (stepIndex === 0) {
      if (v.customerMode === 'existing') {
        if (!v.customerId) {
          form.setError('customerId', { message: 'Select a buyer or add a new one' });
          return false;
        }
      } else {
        let ok = true;
        if (!v.customerFullName.trim()) {
          form.setError('customerFullName', { message: 'Buyer name is required' });
          ok = false;
        }
        if (v.customerPhone.trim().length < 7) {
          form.setError('customerPhone', {
            message: 'Phone must be at least 7 characters',
          });
          ok = false;
        }
        if (
          v.customerEmail.trim() &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.customerEmail.trim())
        ) {
          form.setError('customerEmail', { message: 'Invalid email' });
          ok = false;
        }
        return ok;
      }
      return true;
    }

    if (stepIndex === 1) {
      if (!v.propertyId) {
        form.setError('propertyId', { message: 'Pick a property' });
        return false;
      }
      return true;
    }

    if (stepIndex === 2) {
      let ok = true;
      let total: Kobo | null = null;
      let deposit: Kobo | null = null;
      let monthly: Kobo | null = null;

      try {
        total = parseNgn(v.totalPriceNgn);
        if (total <= 0n) throw new Error('zero');
      } catch {
        form.setError('totalPriceNgn', { message: 'Enter a valid total price' });
        ok = false;
      }
      try {
        deposit = parseNgn(v.depositNgn || '0');
        if (deposit < 0n) throw new Error('neg');
      } catch {
        form.setError('depositNgn', { message: 'Enter a valid deposit (use 0 for none)' });
        ok = false;
      }
      try {
        monthly = parseNgn(v.monthlyNgn);
        if (monthly <= 0n) throw new Error('zero');
      } catch {
        form.setError('monthlyNgn', { message: 'Enter a valid monthly amount' });
        ok = false;
      }

      if (!Number.isInteger(v.termMonths) || v.termMonths < 6 || v.termMonths > 36) {
        form.setError('termMonths', { message: 'Term must be between 6 and 36 months' });
        ok = false;
      }
      const start = new Date(v.startDate);
      if (Number.isNaN(start.getTime())) {
        form.setError('startDate', { message: 'Pick a valid start date' });
        ok = false;
      } else {
        const grace = 24 * 60 * 60 * 1000;
        if (start.getTime() < Date.now() - grace) {
          form.setError('startDate', { message: 'Start date cannot be in the past' });
          ok = false;
        }
      }

      if (ok && total !== null && deposit !== null && monthly !== null) {
        if (deposit > total) {
          setServerBanner(
            `Deposit (${formatKobo(deposit)}) cannot exceed the total price (${formatKobo(total)}).`,
          );
          ok = false;
        } else {
          // Final row = total − deposit − monthly × (term − 1). The schedule generator
          // settles the leftover into this row. It must be positive and at most 2×monthly,
          // otherwise the buyer either underpays or sees a zero/negative final row.
          const finalRow = total - deposit - monthly * BigInt(v.termMonths - 1);
          if (finalRow <= 0n) {
            const overBy = (deposit + monthly * BigInt(v.termMonths - 1) - total) as Kobo;
            setServerBanner(
              `Plan overfunds. Deposit + ${v.termMonths - 1} × monthly already exceeds the total by ${formatKobo(
                overBy,
              )}. Reduce the deposit, monthly, or term so the final month has a real payment to make.`,
            );
            ok = false;
          } else if (finalRow > monthly * 2n) {
            const shortBy = (total - deposit - monthly * BigInt(v.termMonths)) as Kobo;
            setServerBanner(
              `Plan underfunds by ${formatKobo(
                shortBy,
              )}. Deposit + ${v.termMonths} × monthly doesn't reach the total. Increase one of the four values to balance.`,
            );
            ok = false;
          }
        }
      }

      return ok;
    }

    return true;
  };

  const goBack = () => {
    if (isFirstStep) return;
    setServerBanner(null);
    form.clearErrors();
    setStepIndex((i) => i - 1);
  };

  const goForward = async () => {
    const ok = await validateCurrentStep();
    if (!ok) return;
    if (isLastStep) {
      await submit();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const submit = async () => {
    const v = form.getValues();
    setSubmitting(true);
    setServerBanner(null);

    const fd = new FormData();
    fd.append('customerMode', v.customerMode);
    if (v.customerMode === 'existing') {
      fd.append('customerId', v.customerId);
    } else {
      fd.append('customerFullName', v.customerFullName);
      fd.append('customerPhone', v.customerPhone);
      fd.append('customerEmail', v.customerEmail);
      fd.append('customerNationalId', v.customerNationalId);
      fd.append('customerNotes', v.customerNotes);
    }
    fd.append('propertyId', v.propertyId);
    fd.append('totalPriceNgn', v.totalPriceNgn);
    fd.append('depositNgn', v.depositNgn);
    fd.append('monthlyNgn', v.monthlyNgn);
    fd.append('termMonths', String(v.termMonths));
    fd.append('startDate', v.startDate);
    fd.append('depositReceived', v.depositReceived ? 'true' : 'false');
    if (v.depositReceived) {
      // Method always submitted (server requires it when depositReceived === true);
      // the three text fields are only sent when non-empty so the server sees `undefined`
      // and applies its own defaults rather than empty-string validation failures.
      fd.append('depositMethod', v.depositMethod);
      if (v.depositPaidAt.trim()) fd.append('depositPaidAt', v.depositPaidAt);
      if (v.depositReference.trim()) fd.append('depositReference', v.depositReference);
      if (v.depositNotes.trim()) fd.append('depositNotes', v.depositNotes);
    }

    const result: PlanCreateState = await createPlanAction(null, fd);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        const fieldMap: Record<string, keyof FormValues> = {
          'customer.id': 'customerId',
          'customer.fullName': 'customerFullName',
          'customer.phone': 'customerPhone',
          'customer.email': 'customerEmail',
          propertyId: 'propertyId',
          totalPriceNgn: 'totalPriceNgn',
          depositNgn: 'depositNgn',
          monthlyNgn: 'monthlyNgn',
          termMonths: 'termMonths',
          startDate: 'startDate',
          depositReceived: 'depositReceived',
          depositMethod: 'depositMethod',
          depositPaidAt: 'depositPaidAt',
        };
        for (const [path, message] of Object.entries(result.fieldErrors)) {
          const target = fieldMap[path];
          if (target) form.setError(target, { message });
        }
      }
      setServerBanner(result.message);
      toast.error(result.message);
      return;
    }

    toast.success('Plan created.');
    router.push(`/plans/${result.data.id}` as Route);
    router.refresh();
  };

  const attemptCancel = () => {
    const v = form.getValues();
    const hasDraft =
      stepIndex > 1 ||
      v.customerFullName ||
      v.totalPriceNgn ||
      v.monthlyNgn ||
      (v.customerMode === 'existing' && v.propertyId);
    if (hasDraft) setDiscardOpen(true);
    else router.push('/plans' as Route);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLElement) {
      const tag = e.target.tagName;
      if (tag === 'INPUT') {
        e.preventDefault();
        if (!submitting) goForward();
      }
    }
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) goForward();
        }}
        onKeyDown={onKeyDown}
        noValidate
        className="mx-auto w-full max-w-[760px]"
        aria-busy={submitting}
      >
        <div className="rounded-lg border border-paper-300 bg-paper-100 shadow-[0_1px_0_oklch(0.91_0.01_50/0.5)]">
          <WizardProgressRail
            steps={STEPS as unknown as { key: string; title: string }[]}
            currentIndex={stepIndex}
            onJumpTo={(i) => setStepIndex(i)}
          />

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {stepIndex === 0 && (
              <BuyerStep form={form} customers={customers} />
            )}
            {stepIndex === 1 && (
              <PropertyStep form={form} properties={properties} />
            )}
            {stepIndex === 2 && <TermsStep form={form} />}
            {stepIndex === 3 && (
              <ReviewStep form={form} properties={properties} customers={customers} />
            )}
          </div>

          {serverBanner && (
            <div
              role="alert"
              className="border-t border-status-overdue/20 bg-status-overdue/10 px-5 py-3 text-sm text-status-overdue sm:px-8"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{serverBanner}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-paper-300 bg-paper-50 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2">
              {!isFirstStep ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goBack}
                  disabled={submitting}
                  className="text-ink-700 hover:bg-paper-200 hover:text-ink-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={attemptCancel}
                  disabled={submitting}
                  className="rounded-md px-3 py-1.5 text-sm text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-900 focus-visible:bg-paper-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-600/30"
                >
                  Cancel
                </button>
              )}
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-clay-600 text-paper-50 hover:bg-clay-700 focus-visible:ring-clay-600/30"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting && isLastStep ? 'Creating plan…' : CTA_BY_STEP[stepIndex]}
              {!submitting && !isLastStep && <ArrowRight className="h-4 w-4" />}
              {!submitting && isLastStep && <Check className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="bg-paper-50">
          <DialogHeader>
            <DialogTitle className="text-ink-900">Discard this draft?</DialogTitle>
            <DialogDescription className="text-ink-500">
              Anything entered will be lost. The buyer record will not be created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDiscardOpen(false)}
              className="text-ink-700 hover:bg-paper-200 hover:text-ink-900"
            >
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDiscardOpen(false);
                router.push('/plans' as Route);
              }}
              className="bg-status-overdue text-paper-50 hover:bg-status-overdue/90"
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------- Step 1: Buyer ------------------------------- */

function BuyerStep({
  form,
  customers,
}: {
  form: UseFormReturn<FormValues>;
  customers: CustomerOption[];
}) {
  const { register, watch, setValue, formState } = form;
  const mode = watch('customerMode');
  const customerId = watch('customerId');
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const selected = customers.find((c) => c.id === customerId) ?? null;
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) => c.fullName.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customers, query]);

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 1"
        title="Who is buying?"
        subtitle="Find an existing buyer or add a new one. We only need enough to send their schedule."
      />

      <Tabs
        value={mode}
        onChange={(v) => {
          setValue('customerMode', v as 'existing' | 'new');
          form.clearErrors();
        }}
        items={[
          { value: 'existing', label: 'Existing buyer' },
          { value: 'new', label: 'New buyer' },
        ]}
      />

      {mode === 'existing' ? (
        <div className="space-y-2">
          <Label htmlFor="buyer-search" className="text-ink-700">
            Search buyers
          </Label>
          <div className="relative">
            <div
              className={cn(
                'flex h-10 items-center rounded-md border border-paper-400 bg-paper-50',
                'focus-within:border-clay-600 focus-within:ring-[3px] focus-within:ring-clay-600/25',
                formState.errors.customerId && 'border-status-overdue',
              )}
            >
              <Search className="ml-3 h-4 w-4 text-ink-500" aria-hidden />
              <input
                id="buyer-search"
                value={selected ? `${selected.fullName} · ${selected.phone}` : query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setValue('customerId', '');
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Search by name or phone"
                className="h-full flex-1 bg-transparent px-3 text-sm text-ink-900 outline-none placeholder:text-ink-300"
                autoComplete="off"
              />
              <ChevronDown className="mr-3 h-4 w-4 text-ink-500" aria-hidden />
            </div>
            {open && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-paper-300 bg-paper-50 py-1 shadow-[0_2px_8px_-2px_oklch(0.20_0.015_40/0.08),0_8px_24px_-8px_oklch(0.20_0.015_40/0.10)]"
              >
                {filtered.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-ink-500">
                    No buyers match &ldquo;{query}&rdquo;.
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected?.id === c.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setValue('customerId', c.id);
                        setQuery('');
                        setOpen(false);
                        form.clearErrors('customerId');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm transition-colors hover:bg-paper-200',
                        selected?.id === c.id && 'bg-clay-100',
                      )}
                    >
                      <span className="font-medium text-ink-900">{c.fullName}</span>
                      <span data-money className="text-[13px] text-ink-500">
                        {c.phone}
                      </span>
                    </button>
                  ))
                )}
                <div className="border-t border-paper-300">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setValue('customerMode', 'new');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-clay-600 transition-colors hover:bg-paper-200"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add a new buyer instead
                  </button>
                </div>
              </div>
            )}
          </div>
          {formState.errors.customerId && (
            <FieldError>{formState.errors.customerId.message}</FieldError>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="customerFullName"
              label="Full name"
              required
              error={formState.errors.customerFullName?.message}
            >
              <Input
                id="customerFullName"
                className="bg-paper-50"
                placeholder="Adaeze Okafor"
                {...register('customerFullName')}
              />
            </Field>
            <Field
              id="customerPhone"
              label="Phone"
              required
              error={formState.errors.customerPhone?.message}
            >
              <Input
                id="customerPhone"
                type="tel"
                inputMode="tel"
                className="bg-paper-50"
                placeholder="+234 801 234 5678"
                {...register('customerPhone')}
              />
            </Field>
            <Field id="customerEmail" label="Email" error={formState.errors.customerEmail?.message}>
              <Input
                id="customerEmail"
                type="email"
                className="bg-paper-50"
                placeholder="adaeze@example.com"
                {...register('customerEmail')}
              />
            </Field>
            <Field id="customerNationalId" label="National ID (NIN)">
              <Input
                id="customerNationalId"
                className="bg-paper-50"
                placeholder="Optional"
                {...register('customerNationalId')}
              />
            </Field>
          </div>
          <Field id="customerNotes" label="Notes">
            <textarea
              id="customerNotes"
              rows={2}
              placeholder="Anything you want recorded against this buyer"
              className="w-full rounded-md border border-paper-400 bg-paper-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus-visible:border-clay-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-clay-600/25"
              {...register('customerNotes')}
            />
          </Field>
          {customers.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setValue('customerMode', 'existing');
                form.clearErrors();
              }}
              className="text-sm text-clay-600 hover:underline"
            >
              ← Back to existing-buyer search
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Step 2: Property ----------------------------- */

function PropertyStep({
  form,
  properties,
}: {
  form: UseFormReturn<FormValues>;
  properties: PropertyOption[];
}) {
  const { setValue, watch, formState } = form;
  const propertyId = watch('propertyId');
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.addressLine.toLowerCase().includes(q),
    );
  }, [properties, query]);

  if (properties.length === 0) {
    return (
      <div className="space-y-6">
        <StepHeader
          eyebrow="Step 2"
          title="Which property is being sold?"
          subtitle="No properties are currently available."
        />
        <div className="rounded-lg border border-dashed border-paper-400 bg-paper-50 px-6 py-12 text-center">
          <p className="text-base font-medium text-ink-900">No properties available</p>
          <p className="mt-1.5 text-sm text-ink-500">
            Add a property in the Properties page before recording a sale.
          </p>
          <Link
            href={'/properties/new' as Route}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-clay-600 hover:underline"
          >
            Go to Properties
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 2"
        title="Which property is being sold?"
        subtitle="Pick from the available inventory. The total price prefills the next step."
      />

      <div className="space-y-2">
        <Label htmlFor="property-search" className="text-ink-700">
          Search properties
        </Label>
        <div
          className={cn(
            'flex h-10 items-center rounded-md border border-paper-400 bg-paper-50',
            'focus-within:border-clay-600 focus-within:ring-[3px] focus-within:ring-clay-600/25',
          )}
        >
          <Search className="ml-3 h-4 w-4 text-ink-500" aria-hidden />
          <input
            id="property-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code, title or address"
            className="h-full flex-1 bg-transparent px-3 text-sm text-ink-900 outline-none placeholder:text-ink-300"
          />
        </div>
      </div>

      <ul
        role="listbox"
        aria-label="Available properties"
        className="divide-y divide-paper-300 rounded-md border border-paper-300 bg-paper-50"
      >
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-ink-500">
            No properties match &ldquo;{query}&rdquo;.
          </li>
        ) : (
          filtered.map((p) => {
            const selected = propertyId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setValue('propertyId', p.id);
                    setValue('totalPriceNgn', koboToNgnInput(p.totalPriceKobo));
                    form.clearErrors('propertyId');
                  }}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-200 focus-visible:bg-paper-200 focus-visible:outline-none',
                    selected && 'bg-clay-100 hover:bg-clay-100',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        data-money
                        className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-500"
                      >
                        {p.code}
                      </span>
                      <span className="truncate text-[15px] font-semibold text-ink-900">
                        {p.title}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-500">{p.addressLine}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span data-money className="text-[15px] font-medium text-ink-900">
                      {formatKobo(p.totalPriceKobo)}
                    </span>
                    {selected && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-clay-600 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-paper-50">
                        <Check className="h-3 w-3" strokeWidth={3} />
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>

      {formState.errors.propertyId && (
        <FieldError>{formState.errors.propertyId.message}</FieldError>
      )}
    </div>
  );
}

/* ------------------------------ Step 3: Terms ------------------------------ */

function TermsStep({ form }: { form: UseFormReturn<FormValues> }) {
  const { register, watch, formState } = form;
  const total = watch('totalPriceNgn');
  const deposit = watch('depositNgn');
  const monthly = watch('monthlyNgn');
  const term = watch('termMonths');
  const depositReceived = watch('depositReceived');
  const startDate = watch('startDate');

  const balance = React.useMemo(() => safeBalance(total, deposit, monthly, term), [
    total,
    deposit,
    monthly,
    term,
  ]);

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 3"
        title="Payment terms"
        subtitle="Set the total price, deposit, monthly amount and term. We'll generate the schedule next."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="totalPriceNgn" label="Total price" required error={formState.errors.totalPriceNgn?.message}>
          <MoneyInput
            id="totalPriceNgn"
            placeholder="12,500,000"
            invalid={!!formState.errors.totalPriceNgn}
            {...register('totalPriceNgn')}
          />
        </Field>
        <Field id="depositNgn" label="Down payment today" error={formState.errors.depositNgn?.message}>
          <MoneyInput
            id="depositNgn"
            placeholder="1,500,000"
            invalid={!!formState.errors.depositNgn}
            {...register('depositNgn')}
          />
        </Field>
        <Field id="monthlyNgn" label="Monthly amount" required error={formState.errors.monthlyNgn?.message}>
          <MoneyInput
            id="monthlyNgn"
            placeholder="450,000"
            invalid={!!formState.errors.monthlyNgn}
            {...register('monthlyNgn')}
          />
        </Field>
        <Field id="termMonths" label="Term (months, 6–36)" required error={formState.errors.termMonths?.message}>
          <Input
            id="termMonths"
            type="number"
            inputMode="numeric"
            min={6}
            max={36}
            step={1}
            className="bg-paper-50 font-mono"
            {...register('termMonths', { valueAsNumber: true })}
          />
        </Field>
        <Field
          id="startDate"
          label="First payment date"
          required
          error={formState.errors.startDate?.message}
        >
          <div className="relative">
            <Input
              id="startDate"
              type="date"
              className="bg-paper-50 pr-9 font-mono"
              {...register('startDate')}
            />
            <CalendarDays
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
              aria-hidden
            />
          </div>
        </Field>
      </div>

      <BalanceLine balance={balance} />

      <div className="rounded-lg border border-paper-300 bg-paper-50 p-4 sm:p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-paper-400 text-clay-600 focus-visible:ring-2 focus-visible:ring-clay-600/30"
            {...register('depositReceived')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-ink-900">
              Deposit received today
            </span>
            <span className="text-[13px] text-ink-500">
              Tick if the buyer is paying the down payment now. We&apos;ll record it as the first
              payment on the plan.
            </span>
          </span>
        </label>

        {formState.errors.depositReceived && (
          <div className="mt-2">
            <FieldError>{formState.errors.depositReceived.message}</FieldError>
          </div>
        )}

        {depositReceived && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-paper-300 pt-4 sm:grid-cols-2">
            <Field
              id="depositMethod"
              label="Method"
              required
              error={formState.errors.depositMethod?.message}
            >
              <select
                id="depositMethod"
                aria-invalid={!!formState.errors.depositMethod}
                className="h-10 w-full rounded-md border border-paper-400 bg-paper-50 px-3 text-sm text-ink-900 outline-none focus:border-clay-600 focus:ring-[3px] focus:ring-clay-600/25"
                {...register('depositMethod')}
              >
                {DEPOSIT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {DEPOSIT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="depositPaidAt"
              label="Date"
              error={formState.errors.depositPaidAt?.message}
            >
              <Input
                id="depositPaidAt"
                type="date"
                className="bg-paper-50 font-mono"
                min={startDate || undefined}
                {...register('depositPaidAt')}
              />
              <p className="text-[12px] text-ink-500">
                Defaults to the plan start date if you leave this empty.
              </p>
            </Field>
            <Field id="depositReference" label="Reference (optional)">
              <Input
                id="depositReference"
                className="bg-paper-50"
                placeholder="Receipt #, TX ID, cheque number…"
                {...register('depositReference')}
              />
            </Field>
            <Field id="depositNotes" label="Notes (optional)">
              <textarea
                id="depositNotes"
                rows={2}
                className="w-full rounded-md border border-paper-400 bg-paper-50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-clay-600 focus:ring-[3px] focus:ring-clay-600/25"
                {...register('depositNotes')}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceLine({ balance }: { balance: BalanceState }) {
  if (balance.kind === 'pending') {
    return (
      <p className="font-mono text-[12px] text-ink-500">
        Fill in the four amounts to see the running balance.
      </p>
    );
  }

  if (balance.kind === 'balanced') {
    return (
      <p
        data-money
        className="inline-flex items-center gap-2 rounded-md bg-status-paid/10 px-3 py-1.5 text-[13px] font-medium text-status-paid"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
        Balanced: deposit + {balance.term} × monthly = {balance.standard}{' '}
        {balance.exact ? '(exact)' : `(final month settles ${balance.finalDelta})`}.
      </p>
    );
  }

  return (
    <p
      data-money
      className="inline-flex items-start gap-2 rounded-md bg-status-overdue/10 px-3 py-1.5 text-[13px] text-status-overdue"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      {balance.message}
    </p>
  );
}

/* ------------------------------ Step 4: Review ------------------------------ */

function ReviewStep({
  form,
  properties,
  customers,
}: {
  form: UseFormReturn<FormValues>;
  properties: PropertyOption[];
  customers: CustomerOption[];
}) {
  const v = form.getValues();
  const property = properties.find((p) => p.id === v.propertyId);
  const existingBuyer =
    v.customerMode === 'existing' ? customers.find((c) => c.id === v.customerId) ?? null : null;

  let schedule: ReturnType<typeof generateSchedule> | null = null;
  let scheduleError: string | null = null;
  try {
    const totalK = parseNgn(v.totalPriceNgn);
    const depositK = parseNgn(v.depositNgn || '0');
    const monthlyK = parseNgn(v.monthlyNgn);
    schedule = generateSchedule({
      totalPriceKobo: totalK,
      depositKobo: depositK,
      monthlyKobo: monthlyK,
      termMonths: v.termMonths,
      startDate: new Date(v.startDate),
    });
  } catch (e) {
    scheduleError = e instanceof Error ? e.message : 'Could not generate the schedule.';
  }

  const totalDisplay = (() => {
    try {
      return formatKobo(parseNgn(v.totalPriceNgn));
    } catch {
      return v.totalPriceNgn;
    }
  })();

  const monthlyDisplay = (() => {
    try {
      return formatKobo(parseNgn(v.monthlyNgn));
    } catch {
      return v.monthlyNgn;
    }
  })();

  const depositDisplay = (() => {
    try {
      return formatKobo(parseNgn(v.depositNgn || '0'));
    } catch {
      return v.depositNgn;
    }
  })();


  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 4"
        title="Show the buyer their schedule"
        subtitle="Confirm the numbers below with the buyer. Pressing confirm records the sale and generates this schedule for real."
      />

      <div className="rounded-lg border border-paper-300 bg-paper-50 p-5 sm:p-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
          Total payable
        </p>
        <p
          data-money
          className="mt-1 text-[clamp(1.75rem,1.4rem+1.5vw,2.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-ink-900"
        >
          {totalDisplay}
        </p>
        <p data-money className="mt-1 text-sm text-ink-500">
          Over {v.termMonths} months · {monthlyDisplay} monthly · {depositDisplay} down today
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ReviewRow label="Buyer">
          {v.customerMode === 'existing' && existingBuyer ? (
            <>
              <span className="font-medium text-ink-900">{existingBuyer.fullName}</span>
              <span data-money className="text-ink-500"> · {existingBuyer.phone}</span>
            </>
          ) : v.customerMode === 'new' ? (
            <>
              <span className="font-medium text-ink-900">{v.customerFullName || '—'}</span>
              {v.customerPhone && (
                <span data-money className="text-ink-500"> · {v.customerPhone}</span>
              )}
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-sm bg-clay-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-clay-700">
                New buyer
              </div>
            </>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </ReviewRow>
        <ReviewRow label="Property">
          {property ? (
            <>
              <span data-money className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-500">
                {property.code}
              </span>{' '}
              <span className="font-medium text-ink-900">{property.title}</span>
              <div className="text-[13px] text-ink-500">{property.addressLine}</div>
            </>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </ReviewRow>
        <ReviewRow label="First payment">
          <span data-money className="font-medium text-ink-900">
            {formatDateNg(v.startDate)}
          </span>
        </ReviewRow>
        <ReviewRow label="Term">
          <span data-money className="font-medium text-ink-900">
            {v.termMonths} months
          </span>
        </ReviewRow>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
            Payment schedule
          </h3>
          <span className="font-mono text-[11px] text-ink-500">
            {schedule ? `${schedule.length} payments` : ''}
          </span>
        </div>
        <div className="overflow-hidden rounded-md border border-paper-300">
          {scheduleError ? (
            <div className="bg-status-overdue/10 px-4 py-3 text-sm text-status-overdue">
              <AlertTriangle className="mr-2 inline h-4 w-4 -translate-y-px" />
              {scheduleError}
            </div>
          ) : (
            <ScheduleTable rows={schedule!} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleTable({ rows }: { rows: ReturnType<typeof generateSchedule> }) {
  return (
    <>
      {/* Desktop: real table */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-paper-400 bg-paper-100">
            <th className="px-4 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              #
            </th>
            <th className="px-4 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              Due date
            </th>
            <th className="px-4 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.sequenceNo}
              className={cn(
                'border-b border-paper-300 last:border-b-0',
                row.sequenceNo === 0 && 'bg-clay-100/40',
              )}
            >
              <td className="px-4 py-2 text-[13px] text-ink-700">
                {row.sequenceNo === 0 ? (
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-clay-700">
                    Today
                  </span>
                ) : (
                  <span data-money className="text-ink-700">
                    {row.sequenceNo}
                  </span>
                )}
              </td>
              <td data-money className="px-4 py-2 text-[13px] text-ink-700">
                {formatDateNg(row.dueDate.toISOString())}
              </td>
              <td data-money className="px-4 py-2 text-right text-[13px] font-medium text-ink-900">
                {formatKobo(row.amountDueKobo)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked rows */}
      <ul className="divide-y divide-paper-300 sm:hidden">
        {rows.map((row) => (
          <li
            key={row.sequenceNo}
            className={cn(
              'flex items-center justify-between px-4 py-2.5',
              row.sequenceNo === 0 && 'bg-clay-100/40',
            )}
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
                {row.sequenceNo === 0 ? 'Down today' : `Month ${row.sequenceNo}`}
              </span>
              <span data-money className="text-[13px] text-ink-700">
                {formatDateNg(row.dueDate.toISOString())}
              </span>
            </div>
            <span data-money className="text-[14px] font-medium text-ink-900">
              {formatKobo(row.amountDueKobo)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* --------------------------- Shared primitives --------------------------- */

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="hidden font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500 sm:block">
        {eyebrow}
      </p>
      <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-ink-900 sm:text-2xl">
        {title}
      </h2>
      <p className="max-w-prose text-sm text-ink-500">{subtitle}</p>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-ink-700">
        {label}
        {required && <span className="ml-1 text-clay-600">*</span>}
      </Label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
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

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-paper-300 bg-paper-50 px-4 py-3">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
        {label}
      </p>
      <div className="mt-1 text-[14px] text-ink-700">{children}</div>
    </div>
  );
}

function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-md border border-paper-300 bg-paper-100 p-1"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-paper-50 text-ink-900 shadow-[0_1px_0_oklch(0.91_0.01_50/0.5)]' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Helpers ------------------------------- */

type BalanceState =
  | { kind: 'pending' }
  | { kind: 'balanced'; term: number; standard: string; exact: boolean; finalDelta: string }
  | { kind: 'error'; message: string };

function safeBalance(
  totalNgn: string,
  depositNgn: string,
  monthlyNgn: string,
  term: number,
): BalanceState {
  if (!totalNgn || !monthlyNgn || !term) return { kind: 'pending' };
  try {
    const total = parseNgn(totalNgn);
    const deposit = parseNgn(depositNgn || '0');
    const monthly = parseNgn(monthlyNgn);
    if (total <= 0n || monthly <= 0n) return { kind: 'pending' };
    if (!Number.isInteger(term) || term < 6 || term > 36) return { kind: 'pending' };
    if (deposit > total) {
      return {
        kind: 'error',
        message: `Deposit (${formatKobo(deposit)}) exceeds the total price (${formatKobo(total)}).`,
      };
    }
    const standardSum = deposit + monthly * BigInt(term);
    const finalRow = total - deposit - monthly * BigInt(term - 1);
    if (finalRow <= 0n) {
      const overBy = (deposit + monthly * BigInt(term - 1) - total) as Kobo;
      return {
        kind: 'error',
        message: `Overfunds by ${formatKobo(
          overBy,
        )}. Deposit + ${term - 1} × monthly already exceeds the total. Reduce one of the four values.`,
      };
    }
    if (finalRow > monthly * 2n) {
      return {
        kind: 'error',
        message: `Underfunds by ${formatKobo((total - standardSum) as Kobo)}. Increase deposit, monthly, or term.`,
      };
    }
    return {
      kind: 'balanced',
      term,
      standard: formatKobo(standardSum as Kobo),
      exact: finalRow === monthly,
      finalDelta: formatKobo(finalRow as Kobo),
    };
  } catch {
    return { kind: 'pending' };
  }
}

function koboToNgnInput(kobo: Kobo): string {
  const naira = kobo / 100n;
  return new Intl.NumberFormat('en-NG').format(Number(naira));
}

function formatDateNg(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
