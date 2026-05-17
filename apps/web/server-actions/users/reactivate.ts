'use server';

import { revalidatePath } from 'next/cache';
import { userIdSchema } from '@solutio/shared/users';
import {
  reactivateUser,
  UserNotFoundError,
  UserNotDeactivatedError,
} from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole, ForbiddenError } from '@solutio/shared/tenant';
import {
  M6_REACTIVATE_UNAUTHENTICATED_MESSAGE,
  M6_REACTIVATE_FORBIDDEN_MESSAGE,
  M6_REACTIVATE_INVALID_INPUT_MESSAGE,
  M6_REACTIVATE_NOT_FOUND_MESSAGE,
  M6_REACTIVATE_NOT_DEACTIVATED_MESSAGE,
} from './messages';

export type ReactivateUserErrorCode =
  | 'M6_UNAUTHENTICATED'
  | 'M6_FORBIDDEN'
  | 'M6_INVALID_INPUT'
  | 'M6_NOT_FOUND'
  | 'M6_NOT_DEACTIVATED';

export type ReactivateUserState =
  | { ok: true; userId: string }
  | { ok: false; code: ReactivateUserErrorCode; message: string };

export async function reactivateUserAction(
  _prev: ReactivateUserState | undefined,
  formData: FormData,
): Promise<ReactivateUserState> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return {
      ok: false,
      code: 'M6_UNAUTHENTICATED',
      message: M6_REACTIVATE_UNAUTHENTICATED_MESSAGE,
    };
  }

  if (!hasRole(ctx, ['OWNER'])) {
    return { ok: false, code: 'M6_FORBIDDEN', message: M6_REACTIVATE_FORBIDDEN_MESSAGE };
  }

  const parsed = userIdSchema.safeParse({
    userId: formData.get('userId')?.toString() ?? '',
  });
  if (!parsed.success) {
    return { ok: false, code: 'M6_INVALID_INPUT', message: M6_REACTIVATE_INVALID_INPUT_MESSAGE };
  }

  const { userId } = parsed.data;

  try {
    await reactivateUser(ctx, { userId });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, code: 'M6_FORBIDDEN', message: M6_REACTIVATE_FORBIDDEN_MESSAGE };
    }
    if (err instanceof UserNotFoundError) {
      return { ok: false, code: 'M6_NOT_FOUND', message: M6_REACTIVATE_NOT_FOUND_MESSAGE };
    }
    if (err instanceof UserNotDeactivatedError) {
      return {
        ok: false,
        code: 'M6_NOT_DEACTIVATED',
        message: M6_REACTIVATE_NOT_DEACTIVATED_MESSAGE,
      };
    }
    // Unknown error — re-throw so Next renders the error boundary.
    console.error('[reactivateUserAction] unexpected error', err);
    throw err;
  }

  revalidatePath('/users');
  return { ok: true, userId };
}
