import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/customers-service', () => ({
  softDeleteCustomer: vi.fn(),
  CustomerHasPlansError: class CustomerHasPlansError extends Error {
    constructor(id: string, planCount: number) {
      super(`Cannot delete customer ${id}: ${planCount} non-cancelled plan(s) reference it`);
      this.name = 'CustomerHasPlansError';
    }
  },
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
import { softDeleteCustomer, CustomerHasPlansError, CustomerNotFoundError } from '@solutio/db/customers-service';
import { revalidatePath } from 'next/cache';
import { softDeleteCustomerAction } from '../customers/soft-delete';

const getTenantContextMock = vi.mocked(getTenantContext);
const softDeleteCustomerMock = vi.mocked(softDeleteCustomer);
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

describe('softDeleteCustomerAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await softDeleteCustomerAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(softDeleteCustomerMock).not.toHaveBeenCalled();
  });

  test('returns Forbidden when role is STAFF', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const result = await softDeleteCustomerAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Forbidden' });
    expect(softDeleteCustomerMock).not.toHaveBeenCalled();
  });

  test('returns Invalid id when id is not a UUID', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    const result = await softDeleteCustomerAction(null, fd({ id: 'not-a-uuid' }));
    expect(result).toEqual({ ok: false, message: 'Invalid id' });
    expect(softDeleteCustomerMock).not.toHaveBeenCalled();
  });

  test('returns active plans message when CustomerHasPlansError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeleteCustomerMock.mockRejectedValue(new CustomerHasPlansError(validId, 2));
    const result = await softDeleteCustomerAction(null, fd({ id: validId }));
    expect(result).toEqual({
      ok: false,
      message: 'This customer has active plans. Cancel them before deleting.',
    });
  });

  test('returns Customer not found when CustomerNotFoundError is thrown', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeleteCustomerMock.mockRejectedValue(new CustomerNotFoundError(validId));
    const result = await softDeleteCustomerAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: false, message: 'Customer not found' });
  });

  test('returns ok: true on success and revalidates /customers', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeleteCustomerMock.mockResolvedValue(undefined as never);
    const result = await softDeleteCustomerAction(null, fd({ id: validId }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/customers');
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    softDeleteCustomerMock.mockRejectedValue(new Error('Connection dropped'));
    await expect(softDeleteCustomerAction(null, fd({ id: validId }))).rejects.toThrow('Connection dropped');
  });
});
