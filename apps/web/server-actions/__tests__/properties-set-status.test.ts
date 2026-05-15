import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/properties-service', () => ({
  setPropertyStatus: vi.fn(),
  PropertyNotFoundError: class PropertyNotFoundError extends Error {
    constructor(id: string) {
      super(`Property not found: ${id}`);
      this.name = 'PropertyNotFoundError';
    }
  },
  PropertyStatusChangeBlockedError: class PropertyStatusChangeBlockedError extends Error {
    constructor(id: string, reason: string) {
      super(`Cannot change status of property ${id}: ${reason}`);
      this.name = 'PropertyStatusChangeBlockedError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import { setPropertyStatus, PropertyNotFoundError, PropertyStatusChangeBlockedError } from '@solutio/db/properties-service';
import { revalidatePath } from 'next/cache';
import { setPropertyStatusAction } from '../properties/set-status';

const getTenantContextMock = vi.mocked(getTenantContext);
const setPropertyStatusMock = vi.mocked(setPropertyStatus);
const revalidatePathMock = vi.mocked(revalidatePath);

const staffCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'STAFF' as const,
    email: 'staff@test.example',
    mustChangePassword: false,
  },
};

const ownerCtx = { ...staffCtx, user: { ...staffCtx.user, role: 'OWNER' as const } };

const validId = '550e8400-e29b-41d4-a716-446655440000';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFormData = () => fd({ id: validId, status: 'RESERVED' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setPropertyStatusAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await setPropertyStatusAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(setPropertyStatusMock).not.toHaveBeenCalled();
  });

  test('returns Forbidden when role is STAFF', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const result = await setPropertyStatusAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Forbidden' });
    expect(setPropertyStatusMock).not.toHaveBeenCalled();
  });

  test('returns Invalid input when status is SOLD (not in allowed enum)', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const result = await setPropertyStatusAction(null, fd({ id: validId, status: 'SOLD' }));
    expect(result).toEqual({ ok: false, message: 'Invalid input' });
    expect(setPropertyStatusMock).not.toHaveBeenCalled();
  });

  test('returns Invalid input when id is not a UUID', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const result = await setPropertyStatusAction(null, fd({ id: 'not-uuid', status: 'AVAILABLE' }));
    expect(result).toEqual({ ok: false, message: 'Invalid input' });
    expect(setPropertyStatusMock).not.toHaveBeenCalled();
  });

  test('returns Property not found when PropertyNotFoundError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    setPropertyStatusMock.mockRejectedValue(new PropertyNotFoundError(validId));
    const result = await setPropertyStatusAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Property not found' });
  });

  test('returns status blocked message when PropertyStatusChangeBlockedError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const blockedError = new PropertyStatusChangeBlockedError(
      validId,
      'a non-cancelled plan references this property',
    );
    setPropertyStatusMock.mockRejectedValue(blockedError);
    const result = await setPropertyStatusAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: blockedError.message });
  });

  test('returns ok: true on success and revalidates both paths', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    setPropertyStatusMock.mockResolvedValue(undefined as never);
    const result = await setPropertyStatusAction(null, validFormData());
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/properties/${validId}`);
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    setPropertyStatusMock.mockRejectedValue(new Error('DB timeout'));
    await expect(setPropertyStatusAction(null, validFormData())).rejects.toThrow('DB timeout');
  });
});
