import { describe, expect, test, vi, beforeEach } from 'vitest';
import type * as TenantModule from '@solutio/shared/tenant';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db', () => ({
  deactivateUser: vi.fn(),
  UserNotFoundError: class UserNotFoundError extends Error {
    constructor(userId: string) {
      super(`User not found: ${userId}`);
      this.name = 'UserNotFoundError';
    }
  },
  CannotDeactivateSelfError: class CannotDeactivateSelfError extends Error {
    constructor(userId: string) {
      super(`Cannot deactivate self: ${userId}`);
      this.name = 'CannotDeactivateSelfError';
    }
  },
  CannotDeactivateLastOwnerError: class CannotDeactivateLastOwnerError extends Error {
    constructor(userId: string) {
      super(`Cannot deactivate last owner: ${userId}`);
      this.name = 'CannotDeactivateLastOwnerError';
    }
  },
  UserAlreadyDeactivatedError: class UserAlreadyDeactivatedError extends Error {
    constructor(userId: string) {
      super(`User already deactivated: ${userId}`);
      this.name = 'UserAlreadyDeactivatedError';
    }
  },
  UserDeactivateRetryableSerializationError:
    class UserDeactivateRetryableSerializationError extends Error {
      constructor() {
        super('Serialization failure — retryable');
        this.name = 'UserDeactivateRetryableSerializationError';
      }
    },
}));
vi.mock('@solutio/shared/tenant', async () => {
  const actual = await vi.importActual<typeof TenantModule>('@solutio/shared/tenant');
  return {
    ...actual,
    ForbiddenError: class ForbiddenError extends Error {
      constructor(required: string[], actual: string) {
        super(`Forbidden: required one of [${required.join(', ')}], actor has ${actual}`);
        this.name = 'ForbiddenError';
      }
    },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import {
  deactivateUser,
  UserNotFoundError,
  CannotDeactivateSelfError,
  CannotDeactivateLastOwnerError,
  UserAlreadyDeactivatedError,
  UserDeactivateRetryableSerializationError,
} from '@solutio/db';
import { ForbiddenError } from '@solutio/shared/tenant';
import { revalidatePath } from 'next/cache';
import { deactivateUserAction } from '../users/deactivate';

const getTenantContextMock = vi.mocked(getTenantContext);
const deactivateUserMock = vi.mocked(deactivateUser);
const revalidatePathMock = vi.mocked(revalidatePath);

const targetUserId = '01935b7e-0000-7000-8000-cccccccccccc';
const actorOwnerId = '01935b7e-0000-7000-8000-aaaaaaaaaaaa';

const ownerCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: actorOwnerId,
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER' as const,
    email: 'owner@test.com',
    mustChangePassword: false,
  },
};

const adminCtx = {
  ...ownerCtx,
  user: { ...ownerCtx.user, role: 'ADMIN' as const, email: 'admin@test.com' },
};

const staffCtx = {
  ...ownerCtx,
  user: { ...ownerCtx.user, role: 'STAFF' as const, email: 'staff@test.com' },
};

function mkFormData(userId: string = targetUserId): FormData {
  const f = new FormData();
  f.append('userId', userId);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deactivateUserAction', () => {
  test('OWNER happy path → ok: true with userId', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockResolvedValue({ deactivatedAt: new Date() });

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: true, userId: targetUserId });
    expect(revalidatePathMock).toHaveBeenCalledWith('/users');
    expect(deactivateUserMock).toHaveBeenCalledTimes(1);
    expect(deactivateUserMock).toHaveBeenCalledWith(ownerCtx, { userId: targetUserId });
  });

  test('STAFF → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(deactivateUserMock).not.toHaveBeenCalled();
  });

  test('ADMIN → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(deactivateUserMock).not.toHaveBeenCalled();
  });

  test('not signed in → M6_UNAUTHENTICATED, no service call', async () => {
    getTenantContextMock.mockResolvedValue(null);

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_UNAUTHENTICATED', message: expect.any(String) });
    expect(deactivateUserMock).not.toHaveBeenCalled();
  });

  test('bad UUID → M6_INVALID_INPUT, no service call', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);

    const res = await deactivateUserAction(undefined, mkFormData('not-a-uuid'));

    expect(res).toEqual({ ok: false, code: 'M6_INVALID_INPUT', message: expect.any(String) });
    expect(deactivateUserMock).not.toHaveBeenCalled();
  });

  test('empty userId → M6_INVALID_INPUT, no service call', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);

    const res = await deactivateUserAction(undefined, mkFormData(''));

    expect(res).toEqual({ ok: false, code: 'M6_INVALID_INPUT', message: expect.any(String) });
    expect(deactivateUserMock).not.toHaveBeenCalled();
  });

  test('service throws UserNotFoundError → M6_NOT_FOUND', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new UserNotFoundError(targetUserId));

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_NOT_FOUND', message: expect.any(String) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws CannotDeactivateSelfError → M6_CANNOT_DEACTIVATE_SELF', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new CannotDeactivateSelfError(actorOwnerId));

    const res = await deactivateUserAction(undefined, mkFormData(actorOwnerId));

    expect(res).toEqual({
      ok: false,
      code: 'M6_CANNOT_DEACTIVATE_SELF',
      message: expect.any(String),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws CannotDeactivateLastOwnerError → M6_CANNOT_DEACTIVATE_LAST_OWNER', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new CannotDeactivateLastOwnerError(targetUserId));

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({
      ok: false,
      code: 'M6_CANNOT_DEACTIVATE_LAST_OWNER',
      message: expect.any(String),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws UserAlreadyDeactivatedError → M6_ALREADY_DEACTIVATED', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new UserAlreadyDeactivatedError(targetUserId));

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({
      ok: false,
      code: 'M6_ALREADY_DEACTIVATED',
      message: expect.any(String),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws ForbiddenError (defense in depth) → M6_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new ForbiddenError(['OWNER'], 'ADMIN'));

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('retryable serialization error → succeeds on retry → ok: true', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock
      .mockRejectedValueOnce(new UserDeactivateRetryableSerializationError())
      .mockResolvedValueOnce({ deactivatedAt: new Date() });

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: true, userId: targetUserId });
    expect(deactivateUserMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith('/users');
  });

  test('retryable serialization error on both attempts → M6_TRY_AGAIN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock
      .mockRejectedValueOnce(new UserDeactivateRetryableSerializationError())
      .mockRejectedValueOnce(new UserDeactivateRetryableSerializationError());

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_TRY_AGAIN', message: expect.any(String) });
    expect(deactivateUserMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('retryable first attempt, non-retryable error on retry → mapped error', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock
      .mockRejectedValueOnce(new UserDeactivateRetryableSerializationError())
      .mockRejectedValueOnce(new UserNotFoundError(targetUserId));

    const res = await deactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_NOT_FOUND', message: expect.any(String) });
    expect(deactivateUserMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws unexpected error → re-throws', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    deactivateUserMock.mockRejectedValue(new Error('db explosion'));

    await expect(deactivateUserAction(undefined, mkFormData())).rejects.toThrow('db explosion');
  });
});
