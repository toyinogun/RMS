'use server';

import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import { userCreateSchema } from '@solutio/shared/users';
import {
  createUser,
  EmailAlreadyInUseError,
  CannotCreateOwnerError,
} from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { usersAuthAdapter } from '@/lib/users-auth-adapter';
import { hasRole, ForbiddenError } from '@solutio/shared/tenant';
import {
  M6_CREATE_UNAUTHENTICATED_MESSAGE,
  M6_CREATE_FORBIDDEN_MESSAGE,
  M6_CREATE_INVALID_INPUT_MESSAGE,
  M6_CREATE_EMAIL_TAKEN_MESSAGE,
  M6_CREATE_BAD_ROLE_MESSAGE,
} from './messages';

export type CreateUserErrorCode =
  | 'M6_UNAUTHENTICATED'
  | 'M6_FORBIDDEN'
  | 'M6_INVALID_INPUT'
  | 'M6_EMAIL_TAKEN'
  | 'M6_BAD_ROLE';

export type CreateUserState =
  | { ok: true; userId: string; email: string; tempPassword: string }
  | { ok: false; code: CreateUserErrorCode; message: string; fieldErrors?: Record<string, string> };

function flattenZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export async function createUserAction(
  _prev: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return { ok: false, code: 'M6_UNAUTHENTICATED', message: M6_CREATE_UNAUTHENTICATED_MESSAGE };
  }

  if (!hasRole(ctx, ['OWNER'])) {
    return { ok: false, code: 'M6_FORBIDDEN', message: M6_CREATE_FORBIDDEN_MESSAGE };
  }

  const parsed = userCreateSchema.safeParse({
    email: formData.get('email')?.toString() ?? '',
    name: formData.get('name')?.toString() ?? '',
    role: formData.get('role')?.toString() ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'M6_INVALID_INPUT',
      message: M6_CREATE_INVALID_INPUT_MESSAGE,
      fieldErrors: flattenZod(parsed.error),
    };
  }

  let result: Awaited<ReturnType<typeof createUser>>;
  try {
    result = await createUser(ctx, parsed.data, { auth: usersAuthAdapter });
  } catch (err) {
    if (err instanceof EmailAlreadyInUseError) {
      return { ok: false, code: 'M6_EMAIL_TAKEN', message: M6_CREATE_EMAIL_TAKEN_MESSAGE };
    }
    if (err instanceof ForbiddenError) {
      return { ok: false, code: 'M6_FORBIDDEN', message: M6_CREATE_FORBIDDEN_MESSAGE };
    }
    if (err instanceof CannotCreateOwnerError) {
      return { ok: false, code: 'M6_BAD_ROLE', message: M6_CREATE_BAD_ROLE_MESSAGE };
    }
    throw err;
  }

  revalidatePath('/users');
  return {
    ok: true,
    userId: result.user.id,
    email: result.user.email,
    tempPassword: result.tempPassword,
  };
}
