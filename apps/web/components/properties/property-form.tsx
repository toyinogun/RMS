'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatKobo, type Kobo } from '@solutio/shared/money';
import type { PropertyActionState } from '@/server-actions/properties/create';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Strip the currency symbol prefix (e.g. "₦") so the field shows only digits.
function stripCurrencySymbol(s: string): string {
  return s.replace(/^[^\d]+/, '');
}

// Minimal shape required for the edit-mode initial prop.
interface PropertyDetail {
  id: string;
  code: string;
  title: string;
  addressLine: string;
  city: string;
  totalPriceKobo: Kobo;
}

interface PropertyFormProps {
  mode: 'create' | 'edit';
  onSubmit: (data: FormData) => Promise<PropertyActionState>;
  variant?: 'inline' | 'page';
  initial?: PropertyDetail;
}

interface FormValues {
  code: string;
  title: string;
  addressLine: string;
  city: string;
  totalPriceNgn: string;
}

export function PropertyForm({ mode, onSubmit, variant = 'page', initial }: PropertyFormProps) {
  const router = useRouter();

  const defaultValues: FormValues = {
    code: initial?.code ?? '',
    title: initial?.title ?? '',
    addressLine: initial?.addressLine ?? '',
    city: initial?.city ?? '',
    totalPriceNgn: initial?.totalPriceKobo != null
      ? stripCurrencySymbol(formatKobo(initial.totalPriceKobo))
      : '',
  };

  const form = useForm<FormValues>({ defaultValues });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const handleFormSubmit = handleSubmit(async (values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      fd.append(k, v ?? '');
    });
    if (mode === 'edit' && initial?.id) {
      fd.append('id', initial.id);
    }

    const result = await onSubmit(fd);

    if (!result.ok) {
      if (result.fieldErrors) {
        Object.entries(result.fieldErrors).forEach(([k, msg]) => {
          setError(k as keyof FormValues, { message: msg });
        });
      }
      return;
    }

    if (variant === 'page') {
      router.push('/properties');
      router.refresh();
    }
  });

  return (
    <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
      {/* Hidden id field for edit mode */}
      {mode === 'edit' && initial?.id && (
        <input type="hidden" name="id" value={initial.id} />
      )}

      <div className="space-y-1">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.code}
          {...register('code', { required: 'Required' })}
        />
        {errors.code && (
          <p className="text-sm text-red-600">{errors.code.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.title}
          {...register('title', { required: 'Required' })}
        />
        {errors.title && (
          <p className="text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="addressLine">Address</Label>
        <Input
          id="addressLine"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.addressLine}
          {...register('addressLine', { required: 'Required' })}
        />
        {errors.addressLine && (
          <p className="text-sm text-red-600">{errors.addressLine.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="city">City</Label>
        <Input
          id="city"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.city}
          {...register('city', { required: 'Required' })}
        />
        {errors.city && (
          <p className="text-sm text-red-600">{errors.city.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="totalPriceNgn">Total price (NGN)</Label>
        <Input
          id="totalPriceNgn"
          type="text"
          inputMode="decimal"
          required
          aria-required="true"
          aria-invalid={!!errors.totalPriceNgn}
          {...register('totalPriceNgn', { required: 'Required' })}
        />
        {errors.totalPriceNgn && (
          <p className="text-sm text-red-600">{errors.totalPriceNgn.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          Save
        </Button>
        {variant === 'page' && (
          <Button variant="outline" asChild>
            <Link href="/properties">Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
