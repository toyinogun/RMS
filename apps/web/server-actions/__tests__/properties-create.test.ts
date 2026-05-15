import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/properties-service', () => ({
  createProperty: vi.fn(),
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
import { createProperty, PropertyCodeConflictError } from '@solutio/db/properties-service';
import { revalidatePath } from 'next/cache';
import { createPropertyAction } from '../properties/create';

const getTenantContextMock = vi.mocked(getTenantContext);
const createPropertyMock = vi.mocked(createProperty);
const revalidatePathMock = vi.mocked(revalidatePath);

const validCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'STAFF' as const,
    email: 'staff@test.example',
    mustChangePassword: false,
  },
};

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFormData = () =>
  fd({
    code: 'PROP001',
    title: 'Beautiful Villa',
    addressLine: '12 Mango Street',
    city: 'Abuja',
    totalPriceNgn: '5000000',
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createPropertyAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await createPropertyAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(createPropertyMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when code is empty', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await createPropertyAction(
      null,
      fd({ code: '', title: 'Villa', addressLine: '12 Mango', city: 'Abuja', totalPriceNgn: '5000000' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.code).toBeTruthy();
    }
  });

  test('returns fieldErrors when title is empty', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await createPropertyAction(
      null,
      fd({ code: 'PROP001', title: '', addressLine: '12 Mango', city: 'Abuja', totalPriceNgn: '5000000' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.title).toBeTruthy();
    }
  });

  test('returns fieldErrors when totalPriceNgn is invalid', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await createPropertyAction(
      null,
      fd({
        code: 'PROP001',
        title: 'Villa',
        addressLine: '12 Mango',
        city: 'Abuja',
        totalPriceNgn: 'not-a-number',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.totalPriceNgn).toBeTruthy();
    }
  });

  test('returns code conflict error when PropertyCodeConflictError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    createPropertyMock.mockRejectedValue(new PropertyCodeConflictError('PROP001'));
    const result = await createPropertyAction(null, validFormData());
    expect(result).toMatchObject({
      ok: false,
      message: 'Property code already in use',
      fieldErrors: { code: 'Already in use' },
    });
  });

  test('returns ok with id on success and revalidates /properties', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    createPropertyMock.mockResolvedValue({ id: 'prop-new-id' } as never);
    const result = await createPropertyAction(null, validFormData());
    expect(result).toEqual({ ok: true, data: { id: 'prop-new-id' } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
  });

  test('calls createProperty with ctx and parsed data', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    createPropertyMock.mockResolvedValue({ id: 'prop-abc' } as never);
    await createPropertyAction(null, validFormData());
    expect(createPropertyMock).toHaveBeenCalledWith(
      validCtx,
      expect.objectContaining({ code: 'PROP001', title: 'Beautiful Villa', city: 'Abuja' }),
    );
  });
});
