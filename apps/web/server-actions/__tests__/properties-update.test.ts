import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/properties-service', () => ({
  updateProperty: vi.fn(),
  PropertyNotFoundError: class PropertyNotFoundError extends Error {
    constructor(id: string) {
      super(`Property not found: ${id}`);
      this.name = 'PropertyNotFoundError';
    }
  },
  PropertyCodeConflictError: class PropertyCodeConflictError extends Error {
    constructor(code: string) {
      super(`Property code already in use: ${code}`);
      this.name = 'PropertyCodeConflictError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import { updateProperty, PropertyNotFoundError, PropertyCodeConflictError } from '@solutio/db/properties-service';
import { revalidatePath } from 'next/cache';
import { updatePropertyAction } from '../properties/update';

const getTenantContextMock = vi.mocked(getTenantContext);
const updatePropertyMock = vi.mocked(updateProperty);
const revalidatePathMock = vi.mocked(revalidatePath);

const validCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'ADMIN' as const,
    email: 'admin@test.example',
    mustChangePassword: false,
  },
};

const validId = '550e8400-e29b-41d4-a716-446655440000';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFormData = () =>
  fd({
    id: validId,
    code: 'PROP001',
    title: 'Updated Villa',
    addressLine: '12 Mango Street',
    city: 'Lagos',
    totalPriceNgn: '7500000',
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updatePropertyAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await updatePropertyAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(updatePropertyMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when id is not a valid UUID', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await updatePropertyAction(
      null,
      fd({ id: 'bad-id', code: 'PROP001', title: 'Villa', addressLine: '12 Mango', city: 'Lagos', totalPriceNgn: '7500000' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.id).toBeTruthy();
    }
  });

  test('returns fieldErrors when code has invalid format', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await updatePropertyAction(
      null,
      fd({ id: validId, code: 'invalid code!', title: 'Villa', addressLine: '12 Mango', city: 'Lagos', totalPriceNgn: '7500000' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.code).toBeTruthy();
    }
  });

  test('returns Property not found when PropertyNotFoundError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updatePropertyMock.mockRejectedValue(new PropertyNotFoundError(validId));
    const result = await updatePropertyAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Property not found' });
  });

  test('returns code conflict error when PropertyCodeConflictError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updatePropertyMock.mockRejectedValue(new PropertyCodeConflictError('PROP001'));
    const result = await updatePropertyAction(null, validFormData());
    expect(result).toMatchObject({
      ok: false,
      message: 'Property code already in use',
      fieldErrors: { code: 'Already in use' },
    });
  });

  test('returns ok with id on success and revalidates both paths', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updatePropertyMock.mockResolvedValue({ id: validId } as never);
    const result = await updatePropertyAction(null, validFormData());
    expect(result).toEqual({ ok: true, data: { id: validId } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/properties/${validId}`);
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updatePropertyMock.mockRejectedValue(new Error('Unexpected DB error'));
    await expect(updatePropertyAction(null, validFormData())).rejects.toThrow('Unexpected DB error');
  });
});
