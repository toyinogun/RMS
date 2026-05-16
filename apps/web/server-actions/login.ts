'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { isAuthUserDeactivated } from '@solutio/db';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Please enter a valid email and password.' };
  }

  let signInResult: Awaited<ReturnType<typeof auth.api.signInEmail>>;
  try {
    signInResult = await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch {
    return { error: 'Invalid email or password.' };
  }

  // Use signInEmail's return value directly — the freshly-minted session
  // cookie is on the outgoing response, so a same-action `getSession()` call
  // would still read the OLD request cookies and return null.
  if (signInResult?.user) {
    const deactivated = await isAuthUserDeactivated(signInResult.user.id);
    if (deactivated) {
      await auth.api.signOut({ headers: await headers() });
      return { error: 'This account has been deactivated. Contact your account owner.' };
    }
  }

  redirect('/');
}
