'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDb } from '@solutio/db/tenant-client';

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordState = { error?: string };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = schema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const reqHeaders = await headers();
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: reqHeaders,
    });
  } catch {
    return { error: 'Current password is incorrect.' };
  }

  // Better Auth's password update has already committed; if the flag
  // update below fails the user retries — their new password is already
  // valid for next login, so we never end up in a stuck state.
  const db = getTenantDb(ctx.tenantId);
  await db.user.update({
    where: { id: ctx.user.id },
    data: { mustChangePassword: false },
  });

  redirect('/');
}
