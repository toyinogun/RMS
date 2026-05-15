'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createPlanAction, type PlanCreateState } from '@/server-actions/plans/create';

export interface PlanFormCustomerOption {
  id: string;
  fullName: string;
  phone: string;
}

export interface PlanFormPropertyOption {
  id: string;
  code: string;
  title: string;
  addressLine: string;
  totalPriceKobo: Kobo;
}

interface PlanFormProps {
  customers: PlanFormCustomerOption[];
  properties: PlanFormPropertyOption[];
}

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
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function PlanForm({ customers, properties }: PlanFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      customerMode: 'existing',
      customerId: customers[0]?.id ?? '',
      customerFullName: '',
      customerPhone: '',
      customerEmail: '',
      customerNationalId: '',
      customerNotes: '',
      propertyId: properties[0]?.id ?? '',
      totalPriceNgn: '',
      depositNgn: '0',
      monthlyNgn: '',
      termMonths: 24,
      startDate: todayIso(),
    },
  });

  const customerMode = watch('customerMode');

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const fd = new FormData();
    fd.append('customerMode', values.customerMode);
    if (values.customerMode === 'existing') {
      fd.append('customerId', values.customerId);
    } else {
      fd.append('customerFullName', values.customerFullName);
      fd.append('customerPhone', values.customerPhone);
      fd.append('customerEmail', values.customerEmail);
      fd.append('customerNationalId', values.customerNationalId);
      fd.append('customerNotes', values.customerNotes);
    }
    fd.append('propertyId', values.propertyId);
    fd.append('totalPriceNgn', values.totalPriceNgn);
    fd.append('depositNgn', values.depositNgn);
    fd.append('monthlyNgn', values.monthlyNgn);
    fd.append('termMonths', String(values.termMonths));
    fd.append('startDate', values.startDate);
    fd.append('depositReceived', 'false');

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
        };
        for (const [path, message] of Object.entries(result.fieldErrors)) {
          const target = fieldMap[path];
          if (target) setError(target, { message });
        }
      }
      toast.error(result.message);
      return;
    }

    toast.success('Plan created');
    router.push(`/plans/${result.data.id}` as Route);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Customer</h2>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" value="existing" {...register('customerMode')} />
            <span>Existing customer</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="new" {...register('customerMode')} />
            <span>New customer</span>
          </label>
        </div>

        {customerMode === 'existing' ? (
          <div className="space-y-1">
            <Label htmlFor="customerId">Pick customer</Label>
            <select
              id="customerId"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              {...register('customerId', { required: 'Select a customer' })}
            >
              {customers.length === 0 ? <option value="">No customers yet</option> : null}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.phone}
                </option>
              ))}
            </select>
            {errors.customerId && (
              <p className="text-sm text-red-600">{errors.customerId.message}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="customerFullName">Full name</Label>
              <Input id="customerFullName" {...register('customerFullName')} />
              {errors.customerFullName && (
                <p className="text-sm text-red-600">{errors.customerFullName.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input id="customerPhone" inputMode="tel" {...register('customerPhone')} />
              {errors.customerPhone && (
                <p className="text-sm text-red-600">{errors.customerPhone.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" type="email" {...register('customerEmail')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customerNationalId">National ID</Label>
              <Input id="customerNationalId" {...register('customerNationalId')} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="customerNotes">Notes</Label>
              <textarea
                id="customerNotes"
                rows={2}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                {...register('customerNotes')}
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Property</h2>
        <div className="space-y-1">
          <Label htmlFor="propertyId">Pick available property</Label>
          <select
            id="propertyId"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            {...register('propertyId', { required: 'Select a property' })}
          >
            {properties.length === 0 ? (
              <option value="">No AVAILABLE properties — create one first</option>
            ) : null}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.title} · {p.addressLine} · {formatKobo(p.totalPriceKobo)}
              </option>
            ))}
          </select>
          {errors.propertyId && (
            <p className="text-sm text-red-600">{errors.propertyId.message}</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Plan terms</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="totalPriceNgn">Total price (NGN)</Label>
            <Input id="totalPriceNgn" placeholder="5,000,000" {...register('totalPriceNgn')} />
            {errors.totalPriceNgn && (
              <p className="text-sm text-red-600">{errors.totalPriceNgn.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="depositNgn">Deposit (NGN)</Label>
            <Input id="depositNgn" placeholder="500,000" {...register('depositNgn')} />
            {errors.depositNgn && (
              <p className="text-sm text-red-600">{errors.depositNgn.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="monthlyNgn">Monthly (NGN)</Label>
            <Input id="monthlyNgn" placeholder="200,000" {...register('monthlyNgn')} />
            {errors.monthlyNgn && (
              <p className="text-sm text-red-600">{errors.monthlyNgn.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="termMonths">Term (months)</Label>
            <Input
              id="termMonths"
              type="number"
              min={6}
              max={36}
              {...register('termMonths', { valueAsNumber: true })}
            />
            {errors.termMonths && (
              <p className="text-sm text-red-600">{errors.termMonths.message}</p>
            )}
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register('startDate')} />
            {errors.startDate && (
              <p className="text-sm text-red-600">{errors.startDate.message}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-dashed p-4">
        <div className="flex items-center gap-3">
          <input type="checkbox" disabled aria-label="Deposit received now" />
          <div>
            <p className="text-sm font-medium">Deposit received now?</p>
            <p className="text-muted-foreground text-xs">
              Recording deposit at plan creation will be enabled in M4. For now plans are saved as
              DRAFT.
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create plan'}
        </Button>
        <Link href={'/plans' as Route} className="text-muted-foreground text-sm hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
