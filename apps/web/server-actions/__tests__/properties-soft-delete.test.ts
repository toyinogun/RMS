import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/properties-service', () => ({
  softDeleteProperty: vi.fn(),
  PropertyHasPlansError: class PropertyHasPlansError extends Error {
    constructor(id: string, planCount: number) {
      super(`Cannot delete property ${id}: ${planCount} non-cancelled plan(s) reference it`);
      this.name = 'PropertyHasPlansError';
    }
  },
  PropertyNotFoundError: class PropertyNotFoundError extends Error {
    constructor(id: string) {
      super(`Property not found: ${id}`);
      this.name = 'PropertyNotFoundError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import { softDeleteProperty, PropertyHasPlansError, PropertyNotFoundError } from '@solutio/db/properties-service';
import { revalidatePath } from 'next/cache';
import { softDeletePropertyAction } from '../properties/soft-delete';

const getTenantContextMock = vi.mocked(getTenantContext);
const softDeletePropertyMock = vi.mocked(softDeleteProperty);
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

const adminCtx = { ...staffCtx, user: { ...staffCtx.user, role: 'ADMIN' as const } };

const validId = '550e8400-e29b-41d4-a716-446655440000';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('softDeletePropertyAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await softDeletePropertyAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(softDeletePropertyMock).not.toHaveBeenCalled();
  });

  test('returns Forbidden when role is STAFF', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const result = await softDeletePropertyAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Forbidden' });
    expect(softDeletePropertyMock).not.toHaveBeenCalled();
  });

  test('returns Invalid id when id is not a UUID', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    const result = await softDeletePropertyAction(null, fd({ id: 'not-a-uuid' }));
    expect(result).toEqual({ ok: false, message: 'Invalid id' });
    expect(softDeletePropertyMock).not.toHaveBeenCalled();
  });

  test('returns active plans message when PropertyHasPlansError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeletePropertyMock.mockRejectedValue(new PropertyHasPlansError(validId, 3));
    const result = await softDeletePropertyAction(null, fd({ id: validId }));
    expect(result).toEqual({
      ok: false,
      message: 'This property has active plans. Cancel them before deleting.',
    });
  });

  test('returns Property not found when PropertyNotFoundError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeletePropertyMock.mockRejectedValue(new PropertyNotFoundError(validId));
    const result = await softDeletePropertyAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Property not found' });
  });

  test('returns ok: true on success and revalidates /properties', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeletePropertyMock.mockResolvedValue(undefined as never);
    const result = await softDeletePropertyAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeletePropertyMock.mockRejectedValue(new Error('Unexpected failure'));
    await expect(softDeletePropertyAction(null, fd({ id: validId }))).rejects.toThrow('Unexpected failure');
  });
});
