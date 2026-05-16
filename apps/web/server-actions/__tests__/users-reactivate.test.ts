import { describe, expect, test, vi, beforeEach } from 'vitest';
import type * as TenantModule from '@solutio/shared/tenant';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db', () => ({
  reactivateUser: vi.fn(),
  UserNotFoundError: class UserNotFoundError extends Error {
    constructor(userId: string) {
      super(`User not found: ${userId}`);
      this.name = 'UserNotFoundError';
    }
  },
  UserNotDeactivatedError: class UserNotDeactivatedError extends Error {
    constructor(userId: string) {
      super(`User not deactivated: ${userId}`);
      this.name = 'UserNotDeactivatedError';
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
  reactivateUser,
  UserNotFoundError,
  UserNotDeactivatedError,
} from '@solutio/db';
import { ForbiddenError } from '@solutio/shared/tenant';
import { revalidatePath } from 'next/cache';
import { reactivateUserAction } from '../users/reactivate';

const getTenantContextMock = vi.mocked(getTenantContext);
const reactivateUserMock = vi.mocked(reactivateUser);
const revalidatePathMock = vi.mocked(revalidatePath);

const targetUserId = '01935b7e-0000-7000-8000-cccccccccccc';

const ownerCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
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

describe('reactivateUserAction', () => {
  test('OWNER happy path → ok: true with userId', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reactivateUserMock.mockResolvedValue({ user: { id: targetUserId } as any });

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: true, userId: targetUserId });
    expect(revalidatePathMock).toHaveBeenCalledWith('/users');
    expect(reactivateUserMock).toHaveBeenCalledTimes(1);
    expect(reactivateUserMock).toHaveBeenCalledWith(ownerCtx, { userId: targetUserId });
  });

  test('STAFF → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(reactivateUserMock).not.toHaveBeenCalled();
  });

  test('ADMIN → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(reactivateUserMock).not.toHaveBeenCalled();
  });

  test('not signed in → M6_UNAUTHENTICATED, no service call', async () => {
    getTenantContextMock.mockResolvedValue(null);

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_UNAUTHENTICATED', message: expect.any(String) });
    expect(reactivateUserMock).not.toHaveBeenCalled();
  });

  test('bad UUID → M6_INVALID_INPUT, no service call', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);

    const res = await reactivateUserAction(undefined, mkFormData('not-a-uuid'));

    expect(res).toEqual({ ok: false, code: 'M6_INVALID_INPUT', message: expect.any(String) });
    expect(reactivateUserMock).not.toHaveBeenCalled();
  });

  test('empty userId → M6_INVALID_INPUT, no service call', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);

    const res = await reactivateUserAction(undefined, mkFormData(''));

    expect(res).toEqual({ ok: false, code: 'M6_INVALID_INPUT', message: expect.any(String) });
    expect(reactivateUserMock).not.toHaveBeenCalled();
  });

  test('service throws UserNotFoundError → M6_NOT_FOUND', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reactivateUserMock.mockRejectedValue(new UserNotFoundError(targetUserId));

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_NOT_FOUND', message: expect.any(String) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws UserNotDeactivatedError → M6_NOT_DEACTIVATED', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reactivateUserMock.mockRejectedValue(new UserNotDeactivatedError(targetUserId));

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({
      ok: false,
      code: 'M6_NOT_DEACTIVATED',
      message: expect.any(String),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws ForbiddenError (defense in depth) → M6_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reactivateUserMock.mockRejectedValue(new ForbiddenError(['OWNER'], 'ADMIN'));

    const res = await reactivateUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: false, code: 'M6_FORBIDDEN', message: expect.any(String) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('service throws unexpected error → re-throws', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reactivateUserMock.mockRejectedValue(new Error('db explosion'));

    await expect(reactivateUserAction(undefined, mkFormData())).rejects.toThrow('db explosion');
  });
});
