'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/server-actions/login';

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to Solutio</h1>
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        ) : null}
        <SubmitButton />
      </form>
    </main>
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
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
