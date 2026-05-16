'use server';

import { revalidatePath } from 'next/cache';
import { userIdSchema } from '@solutio/shared/users';
import {
  deactivateUser,
  UserNotFoundError,
  CannotDeactivateSelfError,
  CannotDeactivateLastOwnerError,
  UserAlreadyDeactivatedError,
  UserDeactivateRetryableSerializationError,
} from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole, ForbiddenError } from '@solutio/shared/tenant';
import {
  M6_DEACTIVATE_UNAUTHENTICATED_MESSAGE,
  M6_DEACTIVATE_FORBIDDEN_MESSAGE,
  M6_DEACTIVATE_INVALID_INPUT_MESSAGE,
  M6_DEACTIVATE_NOT_FOUND_MESSAGE,
  M6_DEACTIVATE_CANNOT_DEACTIVATE_SELF_MESSAGE,
  M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE,
  M6_DEACTIVATE_ALREADY_DEACTIVATED_MESSAGE,
  M6_DEACTIVATE_TRY_AGAIN_MESSAGE,
} from './messages';

export type DeactivateUserErrorCode =
  | 'M6_UNAUTHENTICATED'
  | 'M6_FORBIDDEN'
  | 'M6_INVALID_INPUT'
  | 'M6_NOT_FOUND'
  | 'M6_CANNOT_DEACTIVATE_SELF'
  | 'M6_CANNOT_DEACTIVATE_LAST_OWNER'
  | 'M6_ALREADY_DEACTIVATED'
  | 'M6_TRY_AGAIN';

export type DeactivateUserState =
  | { ok: true; userId: string }
  | { ok: false; code: DeactivateUserErrorCode; message: string };

export async function deactivateUserAction(
  _prev: DeactivateUserState | undefined,
  formData: FormData,
): Promise<DeactivateUserState> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return {
      ok: false,
      code: 'M6_UNAUTHENTICATED',
      message: M6_DEACTIVATE_UNAUTHENTICATED_MESSAGE,
    };
  }

  if (!hasRole(ctx, ['OWNER'])) {
    return { ok: false, code: 'M6_FORBIDDEN', message: M6_DEACTIVATE_FORBIDDEN_MESSAGE };
  }

  const parsed = userIdSchema.safeParse({
    userId: formData.get('userId')?.toString() ?? '',
  });
  if (!parsed.success) {
    return { ok: false, code: 'M6_INVALID_INPUT', message: M6_DEACTIVATE_INVALID_INPUT_MESSAGE };
  }

  const { userId } = parsed.data;

  // Retry-once on SERIALIZABLE serialization conflict surfaced as
  // UserDeactivateRetryableSerializationError. Mirrors the pattern established
  // for M5 reversePaymentAction.
  try {
    await deactivateUser(ctx, { userId });
  } catch (err) {
    if (err instanceof UserDeactivateRetryableSerializationError) {
      try {
        await deactivateUser(ctx, { userId });
      } catch (retryErr) {
        if (retryErr instanceof UserDeactivateRetryableSerializationError) {
          return { ok: false, code: 'M6_TRY_AGAIN', message: M6_DEACTIVATE_TRY_AGAIN_MESSAGE };
        }
        return mapDeactivateError(retryErr);
      }
    } else {
      return mapDeactivateError(err);
    }
  }

  revalidatePath('/users');
  return { ok: true, userId };
}

function mapDeactivateError(err: unknown): DeactivateUserState {
  if (err instanceof ForbiddenError) {
    return { ok: false, code: 'M6_FORBIDDEN', message: M6_DEACTIVATE_FORBIDDEN_MESSAGE };
  }
  if (err instanceof UserNotFoundError) {
    return { ok: false, code: 'M6_NOT_FOUND', message: M6_DEACTIVATE_NOT_FOUND_MESSAGE };
  }
  if (err instanceof CannotDeactivateSelfError) {
    return {
      ok: false,
      code: 'M6_CANNOT_DEACTIVATE_SELF',
      message: M6_DEACTIVATE_CANNOT_DEACTIVATE_SELF_MESSAGE,
    };
  }
  if (err instanceof CannotDeactivateLastOwnerError) {
    return {
      ok: false,
      code: 'M6_CANNOT_DEACTIVATE_LAST_OWNER',
      message: M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE,
    };
  }
  if (err instanceof UserAlreadyDeactivatedError) {
    return {
      ok: false,
      code: 'M6_ALREADY_DEACTIVATED',
      message: M6_DEACTIVATE_ALREADY_DEACTIVATED_MESSAGE,
    };
  }
  // Unknown error — re-throw so Next renders the error boundary.
  console.error('[deactivateUserAction] unexpected error', err);
  throw err;
}
