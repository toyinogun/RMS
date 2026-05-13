'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePasswordAction, type ChangePasswordState } from '@/server-actions/change-password';

const initialState: ChangePasswordState = {};

export default function ChangePasswordPage() {
  const [state, formAction] = useFormState(changePasswordAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-slate-600">
        For your first login, you must replace your seed password.
      </p>
      <form action={formAction} className="space-y-4">
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField name="newPassword" label="New password (min 12 chars)" autoComplete="new-password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        ) : null}
        <SubmitButton />
      </form>
    </main>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      <input
        type="password"
        name={name}
        required
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
    >
      {pending ? 'Updating…' : 'Update password'}
    </button>
  );
}
