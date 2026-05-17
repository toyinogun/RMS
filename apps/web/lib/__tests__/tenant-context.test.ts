import { describe, expect, test, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('../auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@solutio/db/client', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

describe('getTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns null when auth.api.getSession returns null', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const { getTenantContext } = await import('../tenant-context');
    const result = await getTenantContext();

    expect(result).toBeNull();
  });

  test('returns null when session user is null', async () => {
    mockGetSession.mockResolvedValueOnce({ user: null });

    const { getTenantContext } = await import('../tenant-context');
    const result = await getTenantContext();

    expect(result).toBeNull();
  });

  test('returns null when domainUser is not found', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'auth-user-123' },
    });
    mockFindUnique.mockResolvedValueOnce(null);

    const { getTenantContext } = await import('../tenant-context');
    const result = await getTenantContext();

    expect(result).toBeNull();
  });

  test('returns TenantContext when domainUser is active', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'auth-user-123' },
    });
    mockFindUnique.mockResolvedValueOnce({
      id: 'domain-user-1',
      authUserId: 'auth-user-123',
      tenantId: 'tenant-1',
      role: 'OWNER',
      email: 'user@example.com',
      mustChangePassword: false,
      deactivatedAt: null,
    });

    const { getTenantContext } = await import('../tenant-context');
    const result = await getTenantContext();

    expect(result).toEqual({
      tenantId: 'tenant-1',
      user: {
        id: 'domain-user-1',
        authUserId: 'auth-user-123',
        role: 'OWNER',
        email: 'user@example.com',
        mustChangePassword: false,
      },
    });
  });

  test('returns null when domainUser is deactivated', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'auth-user-123' },
    });
    mockFindUnique.mockResolvedValueOnce({
      id: 'domain-user-1',
      authUserId: 'auth-user-123',
      tenantId: 'tenant-1',
      role: 'MEMBER',
      email: 'deactivated@example.com',
      mustChangePassword: false,
      deactivatedAt: new Date('2026-05-01'),
    });

    const { getTenantContext } = await import('../tenant-context');
    const result = await getTenantContext();

    expect(result).toBeNull();
  });
});
