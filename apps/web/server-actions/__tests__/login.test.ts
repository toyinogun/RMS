import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signInEmail: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@solutio/db', () => ({
  isAuthUserDeactivated: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isAuthUserDeactivated } from '@solutio/db';
import { loginAction } from '../login';

const signInEmailMock = vi.mocked(auth.api.signInEmail);
const signOutMock = vi.mocked(auth.api.signOut);
const getSessionMock = vi.mocked(auth.api.getSession);
const redirectMock = vi.mocked(redirect);
const isAuthUserDeactivatedMock = vi.mocked(isAuthUserDeactivated);

function mkFormData(overrides: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    email: 'user@example.com',
    password: 'secret123',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) f.append(k, v);
  return f;
}

const activeSession = { user: { id: 'auth-user-id-123' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loginAction', () => {
  test('happy path — active user → redirect to /', async () => {
    signInEmailMock.mockResolvedValue(undefined as never);
    getSessionMock.mockResolvedValue(activeSession as never);
    isAuthUserDeactivatedMock.mockResolvedValue(false);

    await loginAction({}, mkFormData());

    expect(signInEmailMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(isAuthUserDeactivatedMock).toHaveBeenCalledWith('auth-user-id-123');
    expect(signOutMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  test('bad credentials — signInEmail throws → error returned, no DB lookup', async () => {
    signInEmailMock.mockRejectedValue(new Error('invalid credentials'));

    const result = await loginAction({}, mkFormData());

    expect(result).toEqual({ error: 'Invalid email or password.' });
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(isAuthUserDeactivatedMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test('deactivated user — signOut called, error returned, no redirect', async () => {
    signInEmailMock.mockResolvedValue(undefined as never);
    getSessionMock.mockResolvedValue(activeSession as never);
    isAuthUserDeactivatedMock.mockResolvedValue(true);
    signOutMock.mockResolvedValue(undefined as never);

    const result = await loginAction({}, mkFormData());

    expect(signInEmailMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(isAuthUserDeactivatedMock).toHaveBeenCalledWith('auth-user-id-123');
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      error: 'This account has been deactivated. Contact your account owner.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test('bad schema — missing email → error returned, no auth call', async () => {
    const result = await loginAction({}, mkFormData({ email: 'not-an-email' }));

    expect(result).toEqual({ error: 'Please enter a valid email and password.' });
    expect(signInEmailMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(isAuthUserDeactivatedMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test('bad schema — empty password → error returned, no auth call', async () => {
    const result = await loginAction({}, mkFormData({ password: '' }));

    expect(result).toEqual({ error: 'Please enter a valid email and password.' });
    expect(signInEmailMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(isAuthUserDeactivatedMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test('getSession returns null (Better Auth quirk) — falls through to redirect', async () => {
    signInEmailMock.mockResolvedValue(undefined as never);
    getSessionMock.mockResolvedValue(null as never);

    await loginAction({}, mkFormData());

    expect(isAuthUserDeactivatedMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/');
  });
});
