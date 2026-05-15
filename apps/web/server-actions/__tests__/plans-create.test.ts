import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/plans-service', () => ({
  createPlan: vi.fn(),
  PropertyNotAvailableError: class PropertyNotAvailableError extends Error {
    constructor(id: string, status: string) {
      super(`Property ${id} is not available (status: ${status})`);
      this.name = 'PropertyNotAvailableError';
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
import {
  createPlan,
  PropertyNotAvailableError,
  CustomerNotFoundError,
} from '@solutio/db/plans-service';
import { revalidatePath } from 'next/cache';
import { createPlanAction } from '../plans/create';

const getTenantContextMock = vi.mocked(getTenantContext);
const createPlanMock = vi.mocked(createPlan);
const revalidatePathMock = vi.mocked(revalidatePath);

const staffCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'STAFF' as const,
    email: 'staff@test',
    mustChangePassword: false,
  },
};

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const validId = '550e8400-e29b-41d4-a716-446655440000';
const customerId = '550e8400-e29b-41d4-a716-446655440001';
const propertyId = '550e8400-e29b-41d4-a716-446655440002';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const baseValidFd = () =>
  fd({
    customerMode: 'existing',
    customerId,
    propertyId,
    totalPriceNgn: '5,000,000',
    depositNgn: '500,000',
    monthlyNgn: '200,000',
    termMonths: '24',
    startDate: tomorrow(),
    depositReceived: 'false',
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createPlanAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const res = await createPlanAction(null, baseValidFd());
    expect(res).toEqual({ ok: false, message: 'Not signed in' });
    expect(createPlanMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when validation fails', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const bad = fd({
      customerMode: 'existing',
      customerId,
      propertyId,
      totalPriceNgn: '0',
      depositNgn: '0',
      monthlyNgn: '0',
      termMonths: '5',
      startDate: tomorrow(),
      depositReceived: 'false',
    });
    const res = await createPlanAction(null, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
    }
    expect(createPlanMock).not.toHaveBeenCalled();
  });

  test('rejects depositReceived=true with M4 message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const f = baseValidFd();
    f.set('depositReceived', 'true');
    const res = await createPlanAction(null, f);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const messages = Object.values(res.fieldErrors ?? {});
      expect(messages.some((m) => m.includes('M4'))).toBe(true);
    }
  });

  test('maps PropertyNotAvailableError to a refresh-and-retry message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    createPlanMock.mockRejectedValue(new PropertyNotAvailableError(propertyId, 'RESERVED'));
    const res = await createPlanAction(null, baseValidFd());
    expect(res).toEqual({
      ok: false,
      message: 'That property is no longer available. Refresh and try again.',
    });
  });

  test('maps CustomerNotFoundError to a refresh-and-retry message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    createPlanMock.mockRejectedValue(new CustomerNotFoundError(customerId));
    const res = await createPlanAction(null, baseValidFd());
    expect(res).toEqual({
      ok: false,
      message: 'Selected customer no longer exists. Refresh and try again.',
    });
  });

  test('happy path returns { ok: true } and revalidates /plans + /properties', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    createPlanMock.mockResolvedValue({ id: validId });
    const res = await createPlanAction(null, baseValidFd());
    expect(res).toEqual({ ok: true, data: { id: validId } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans');
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    createPlanMock.mockRejectedValue(new Error('db gone'));
    await expect(createPlanAction(null, baseValidFd())).rejects.toThrow('db gone');
  });

  test('accepts new-customer payload', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    createPlanMock.mockResolvedValue({ id: validId });
    const f = fd({
      customerMode: 'new',
      customerFullName: 'Brand New',
      customerPhone: '+2348012345678',
      propertyId,
      totalPriceNgn: '5,000,000',
      depositNgn: '500,000',
      monthlyNgn: '200,000',
      termMonths: '24',
      startDate: tomorrow(),
      depositReceived: 'false',
    });
    const res = await createPlanAction(null, f);
    expect(res.ok).toBe(true);
    const callArg = createPlanMock.mock.calls[0]![1];
    if (callArg.customer.mode !== 'new') throw new Error('expected new mode');
    expect(callArg.customer.fullName).toBe('Brand New');
  });
});
