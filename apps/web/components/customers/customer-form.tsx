'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { customerCreateSchema, customerUpdateSchema } from '@solutio/shared/customers';
import type { CustomerCreateInput } from '@solutio/shared/customers';
import type { CustomerActionState } from '@/server-actions/customers/create';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Minimal shape required for the edit-mode initial prop.
// The full DB row has more fields, but the form only needs these.
interface CustomerDetail {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  nationalId?: string | null;
  notes?: string | null;
}

interface CustomerFormProps {
  mode: 'create' | 'edit';
  onSubmit: (data: FormData) => Promise<CustomerActionState>;
  variant?: 'inline' | 'page';
  initial?: CustomerDetail;
}

type FormValues = CustomerCreateInput;

export function CustomerForm({ mode, onSubmit, variant = 'page', initial }: CustomerFormProps) {
  const router = useRouter();
  const schema = mode === 'edit' ? customerUpdateSchema : customerCreateSchema;

  const defaultValues: Partial<FormValues> = {
    fullName: initial?.fullName ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? undefined,
    nationalId: initial?.nationalId ?? undefined,
    notes: initial?.notes ?? undefined,
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const handleFormSubmit = handleSubmit(async (values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        fd.append(k, String(v));
      } else {
        fd.append(k, '');
      }
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
      router.push('/customers');
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
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.fullName}
          {...register('fullName')}
        />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="text"
          inputMode="tel"
          required
          aria-required="true"
          aria-invalid={!!errors.phone}
          {...register('phone')}
        />
        {errors.phone && (
          <p className="text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="nationalId">National ID</Label>
        <Input
          id="nationalId"
          type="text"
          aria-invalid={!!errors.nationalId}
          {...register('nationalId')}
        />
        {errors.nationalId && (
          <p className="text-sm text-red-600">{errors.nationalId.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-invalid={!!errors.notes}
          {...register('notes')}
        />
        {errors.notes && (
          <p className="text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          Save
        </Button>
        {variant === 'page' && (
          <Button variant="outline" asChild>
            <Link href="/customers">Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
