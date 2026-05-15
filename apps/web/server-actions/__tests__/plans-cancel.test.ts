import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/plans-service', () => ({
  cancelPlan: vi.fn(),
  PlanNotFoundError: class PlanNotFoundError extends Error {
    constructor(id: string) {
      super(`Plan not found: ${id}`);
      this.name = 'PlanNotFoundError';
    }
  },
  PlanHasPaymentsError: class PlanHasPaymentsError extends Error {
    constructor(id: string, count: number) {
      super(`Cannot cancel plan ${id}: ${count} payment(s) recorded`);
      this.name = 'PlanHasPaymentsError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import {
  cancelPlan,
  PlanNotFoundError,
  PlanHasPaymentsError,
} from '@solutio/db/plans-service';
import { revalidatePath } from 'next/cache';
import { cancelPlanAction } from '../plans/cancel';

const getTenantContextMock = vi.mocked(getTenantContext);
const cancelPlanMock = vi.mocked(cancelPlan);
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
const ownerCtx = { ...staffCtx, user: { ...staffCtx.user, role: 'OWNER' as const } };

const validId = '550e8400-e29b-41d4-a716-446655440000';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}
const validFormData = () => fd({ id: validId });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancelPlanAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const res = await cancelPlanAction(null, validFormData());
    expect(res).toEqual({ ok: false, message: 'Not signed in' });
  });

  test('returns Forbidden when role is STAFF', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const res = await cancelPlanAction(null, validFormData());
    expect(res).toEqual({ ok: false, message: 'Forbidden' });
    expect(cancelPlanMock).not.toHaveBeenCalled();
  });

  test('returns Invalid input when id is not a uuid', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const res = await cancelPlanAction(null, fd({ id: 'nope' }));
    expect(res).toEqual({ ok: false, message: 'Invalid input' });
  });

  test('maps PlanNotFoundError', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    cancelPlanMock.mockRejectedValue(new PlanNotFoundError(validId));
    const res = await cancelPlanAction(null, validFormData());
    expect(res).toEqual({ ok: false, message: 'Plan not found' });
  });

  test('maps PlanHasPaymentsError', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    cancelPlanMock.mockRejectedValue(new PlanHasPaymentsError(validId, 2));
    const res = await cancelPlanAction(null, validFormData());
    expect(res).toEqual({
      ok: false,
      message: 'This plan has recorded payments. Reverse them before cancelling.',
    });
  });

  test('happy path returns ok and revalidates both paths', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    cancelPlanMock.mockResolvedValue(undefined as never);
    const res = await cancelPlanAction(null, validFormData());
    expect(res).toEqual({ ok: true, data: { id: validId } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/plans/${validId}`);
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    cancelPlanMock.mockRejectedValue(new Error('db gone'));
    await expect(cancelPlanAction(null, validFormData())).rejects.toThrow('db gone');
  });
});
