import { describe, expect, test, vi, beforeEach } from 'vitest';
import type * as TenantModule from '@solutio/shared/tenant';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db', () => ({
  createUser: vi.fn(),
  EmailAlreadyInUseError: class EmailAlreadyInUseError extends Error {
    constructor(email: string) {
      super(`Email already in use: ${email}`);
      this.name = 'EmailAlreadyInUseError';
    }
  },
  CannotCreateOwnerError: class CannotCreateOwnerError extends Error {
    constructor() {
      super('Cannot create a user with role OWNER via this API');
      this.name = 'CannotCreateOwnerError';
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
vi.mock('@/lib/users-auth-adapter', () => ({
  usersAuthAdapter: { signUpEmail: vi.fn().mockResolvedValue({ authUserId: 'auth-stub' }) },
}));

import { getTenantContext } from '@/lib/tenant-context';
import {
  createUser,
  EmailAlreadyInUseError,
  CannotCreateOwnerError,
} from '@solutio/db';
import { ForbiddenError } from '@solutio/shared/tenant';
import { revalidatePath } from 'next/cache';
import { createUserAction } from '../users/create';

const getTenantContextMock = vi.mocked(getTenantContext);
const createUserMock = vi.mocked(createUser);
const revalidatePathMock = vi.mocked(revalidatePath);

const userId = '01935b7e-0000-7000-8000-cccccccccccc';
const tempPassword = 'Ax7#mQ2$zK9!';

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

function mkFormData(overrides: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    email: 'newuser@example.com',
    name: 'New User',
    role: 'STAFF',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createUserAction', () => {
  test('OWNER happy path → ok: true with tempPassword passed through', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createUserMock.mockResolvedValue({ user: { id: userId, email: 'newuser@example.com' } as any, tempPassword });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await createUserAction(undefined, mkFormData());

    expect(res).toEqual({ ok: true, userId, email: 'newuser@example.com', tempPassword });
    expect(revalidatePathMock).toHaveBeenCalledWith('/users');
    expect(createUserMock).toHaveBeenCalledTimes(1);

    // tempPassword must NOT appear in any console output
    const allLoggedArgs = [
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
    ]
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    expect(allLoggedArgs).not.toContain(tempPassword);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('STAFF → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_FORBIDDEN',
      message: 'Only owners can create users.',
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  test('ADMIN → M6_FORBIDDEN, no service call', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_FORBIDDEN',
      message: 'Only owners can create users.',
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  test('not signed in → M6_UNAUTHENTICATED, no service call', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_UNAUTHENTICATED',
      message: 'You must be signed in to create users.',
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  test('bad email → M6_INVALID_INPUT with fieldErrors.email', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const res = await createUserAction(undefined, mkFormData({ email: 'not-an-email' }));
    expect(res).toMatchObject({
      ok: false,
      code: 'M6_INVALID_INPUT',
      fieldErrors: expect.objectContaining({ email: expect.any(String) }),
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  test('role === "OWNER" submitted → M6_INVALID_INPUT (caught by schema, not service)', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const res = await createUserAction(undefined, mkFormData({ role: 'OWNER' }));
    expect(res).toMatchObject({
      ok: false,
      code: 'M6_INVALID_INPUT',
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  test('service throws EmailAlreadyInUseError → M6_EMAIL_TAKEN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    createUserMock.mockRejectedValue(new EmailAlreadyInUseError('newuser@example.com'));
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_EMAIL_TAKEN',
      message: 'That email is already in use.',
    });
  });

  test('service throws ForbiddenError (defense in depth) → M6_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    createUserMock.mockRejectedValue(new ForbiddenError(['OWNER'], 'STAFF'));
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_FORBIDDEN',
      message: 'Only owners can create users.',
    });
  });

  test('service throws CannotCreateOwnerError → M6_BAD_ROLE', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    createUserMock.mockRejectedValue(new CannotCreateOwnerError());
    const res = await createUserAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M6_BAD_ROLE',
      message: 'The selected role is not allowed.',
    });
  });

  test('service throws unexpected error → re-throws', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    createUserMock.mockRejectedValue(new Error('db explosion'));
    await expect(createUserAction(undefined, mkFormData())).rejects.toThrow('db explosion');
  });
});
