import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/customers-service', () => ({ createCustomer: vi.fn() }));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import { createCustomer } from '@solutio/db/customers-service';
import { revalidatePath } from 'next/cache';
import { createCustomerAction } from '../customers/create';

const getTenantContextMock = vi.mocked(getTenantContext);
const createCustomerMock = vi.mocked(createCustomer);
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

const ownerCtx = { ...validCtx, user: { ...validCtx.user, role: 'OWNER' as const } };

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFormData = () => fd({ fullName: 'Ada Okonkwo', phone: '+2348012345001' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCustomerAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const result = await createCustomerAction(null, validFormData());
    expect(result).toEqual({ ok: false, message: 'Not signed in' });
    expect(createCustomerMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when fullName is empty', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await createCustomerAction(null, fd({ fullName: '', phone: '+2348012345001' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.fullName).toBeTruthy();
    }
  });

  test('returns fieldErrors when phone is too short', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    const result = await createCustomerAction(null, fd({ fullName: 'Ada', phone: '12' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.phone).toBeTruthy();
    }
  });

  test('returns ok with id on success', async () => {
    getTenantContextMock.mockResolvedValue(validCtx);
    createCustomerMock.mockResolvedValue({ id: 'new-customer-id' } as never);
    const result = await createCustomerAction(null, validFormData());
    expect(result).toEqual({ ok: true, data: { id: 'new-customer-id' } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/customers');
  });

  test('calls createCustomer with ctx and parsed data', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    createCustomerMock.mockResolvedValue({ id: 'cust-abc' } as never);
    await createCustomerAction(null, fd({ fullName: 'Bola Ade', phone: '+2348099999999' }));
    expect(createCustomerMock).toHaveBeenCalledWith(
      ownerCtx,
      expect.objectContaining({ fullName: 'Bola Ade', phone: '+2348099999999' }),
    );
  });
});
