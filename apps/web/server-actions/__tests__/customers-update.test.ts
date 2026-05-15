import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/customers-service', () => ({
  updateCustomer: vi.fn(),
  CustomerNotFoundError: class CustomerNotFoundError extends Error {
    constructor(id: string) {
      super(`Customer not found: ${id}`);
      this.name = 'CustomerNotFoundError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import { updateCustomer, CustomerNotFoundError } from '@solutio/db/customers-service';
import { revalidatePath } from 'next/cache';
import { updateCustomerAction } from '../customers/update';

const getTenantContextMock = vi.mocked(getTenantContext);
const updateCustomerMock = vi.mocked(updateCustomer);
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

const validId = '550e8400-e29b-41d4-a716-446655440000';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFormData = () =>
  fd({ id: validId, fullName: 'Ada Okonkwo', phone: '+2348012345001' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateCustomerAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await updateCustomerAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(updateCustomerMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when id is not a valid UUID', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await updateCustomerAction(
      null,
      fd({ id: 'not-a-uuid', fullName: 'Ada', phone: '+2348012345001' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.id).toBeTruthy();
    }
  });

  test('returns fieldErrors when fullName is empty', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await updateCustomerAction(
      null,
      fd({ id: validId, fullName: '', phone: '+2348012345001' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.fullName).toBeTruthy();
    }
  });

  test('returns Customer not found when CustomerNotFoundError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updateCustomerMock.mockRejectedValue(new CustomerNotFoundError(validId));
    const result = await updateCustomerAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Customer not found' });
  });

  test('returns ok with id on success and revalidates both paths', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updateCustomerMock.mockResolvedValue({ id: validId } as never);
    const result = await updateCustomerAction(null, validFormData());
    expect(result).toEqual({ ok: true, data: { id: validId } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/customers');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/customers/${validId}`);
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    updateCustomerMock.mockRejectedValue(new Error('Unexpected DB error'));
    await expect(updateCustomerAction(null, validFormData())).rejects.toThrow('Unexpected DB error');
  });
});
