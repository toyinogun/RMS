'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { userCreateSchema } from '@solutio/shared/users';
import type { UserCreateInput } from '@solutio/shared/users';
import {
  createUserAction,
  type CreateUserState,
} from '@/server-actions/users/create';
import { TempPasswordPanel } from './temp-password-panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type FormValues = UserCreateInput;

export function NewUserForm() {
  const [state, formAction, isPending] = useActionState<
    CreateUserState | undefined,
    FormData
  >(createUserAction, undefined);

  const form = useForm<FormValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'STAFF',
    },
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  // Surface server-side field errors into react-hook-form on each state update.
  React.useEffect(() => {
    if (!state || state.ok) return;
    if (state.fieldErrors) {
      for (const [key, message] of Object.entries(state.fieldErrors)) {
        setError(key as keyof FormValues, { message });
      }
    }
  }, [state, setError]);

  // Success state: swap form for the temp password panel.
  if (state?.ok === true) {
    return (
      <div className="space-y-4">
        <TempPasswordPanel email={state.email} tempPassword={state.tempPassword} />
        <Link href="/users" className="text-sm text-slate-600 hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  const handleFormSubmit = handleSubmit((values) => {
    const fd = new FormData();
    fd.append('name', values.name);
    fd.append('email', values.email);
    fd.append('role', values.role);
    // startTransition is handled by useActionState internally when using form.action,
    // but since we build FormData manually we dispatch via formAction directly.
    React.startTransition(() => {
      formAction(fd);
    });
  });

  const topLevelError =
    state && !state.ok && !state.fieldErrors ? state.message : null;

  return (
    <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
      {topLevelError && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {topLevelError}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          required
          aria-required="true"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          aria-required="true"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-invalid={!!errors.role}
          {...register('role')}
        >
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </select>
        {errors.role && (
          <p className="text-sm text-red-600">{errors.role.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
