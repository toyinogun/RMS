import { describe, expect, test, vi, beforeEach } from 'vitest';
import type * as TenantModule from '@solutio/shared/tenant';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/payments-service', () => ({
  reversePayment: vi.fn(),
  PaymentNotFoundError: class PaymentNotFoundError extends Error {
    constructor(paymentId: string) {
      super(`Payment ${paymentId} not found`);
      this.name = 'PaymentNotFoundError';
    }
  },
  PaymentAlreadyReversedError: class PaymentAlreadyReversedError extends Error {
    constructor(paymentId: string) {
      super(`Payment ${paymentId} has already been reversed`);
      this.name = 'PaymentAlreadyReversedError';
    }
  },
  CannotReverseReversalRowError: class CannotReverseReversalRowError extends Error {
    constructor(paymentId: string) {
      super(`Payment ${paymentId} is itself a reversal and cannot be reversed`);
      this.name = 'CannotReverseReversalRowError';
    }
  },
  PaymentRetryableSerializationError: class PaymentRetryableSerializationError extends Error {
    constructor() {
      super('Payment transaction failed due to serialization conflict — retry');
      this.name = 'PaymentRetryableSerializationError';
    }
  },
}));
vi.mock('@solutio/shared/tenant', async () => {
  const actual = await vi.importActual<typeof TenantModule>('@solutio/shared/tenant');
  return {
    ...actual,
    ForbiddenError: class ForbiddenError extends Error {
      constructor(required: string[], actual: string) {
        super(`Forbidden: required one of [${required.join(', ')}], actor has ${actual}`);
        this.name = 'ForbiddenError';
      }
    },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import {
  reversePayment,
  PaymentNotFoundError,
  PaymentAlreadyReversedError,
  CannotReverseReversalRowError,
  PaymentRetryableSerializationError,
} from '@solutio/db/payments-service';
import { ForbiddenError } from '@solutio/shared/tenant';
import { revalidatePath } from 'next/cache';
import { reversePaymentAction } from '../payments/reverse';

const getTenantContextMock = vi.mocked(getTenantContext);
const reversePaymentMock = vi.mocked(reversePayment);
const revalidatePathMock = vi.mocked(revalidatePath);

const planId = '550e8400-e29b-41d4-a716-446655440000';
const paymentId = '550e8400-e29b-41d4-a716-446655440010';
const reversalPaymentId = '550e8400-e29b-41d4-a716-446655440020';

const ownerCtx = {
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER' as const,
    email: 'owner@test',
    mustChangePassword: false,
  },
};

const adminCtx = {
  ...ownerCtx,
  user: { ...ownerCtx.user, role: 'ADMIN' as const, email: 'admin@test' },
};

const staffCtx = {
  ...ownerCtx,
  user: { ...ownerCtx.user, role: 'STAFF' as const, email: 'staff@test' },
};

function mkFormData(overrides: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    paymentId,
    planId,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reversePaymentAction', () => {
  test('OWNER can reverse a payment → ok: true', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockResolvedValue({
      reversalPaymentId,
      planStatus: 'ACTIVE',
    });
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({ ok: true, reversalPaymentId, planStatus: 'ACTIVE' });
    expect(reversePaymentMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/plans/${planId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });

  test('ADMIN can reverse a payment → ok: true', async () => {
    getTenantContextMock.mockResolvedValue(adminCtx);
    reversePaymentMock.mockResolvedValue({
      reversalPaymentId,
      planStatus: 'COMPLETED',
    });
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({ ok: true, reversalPaymentId, planStatus: 'COMPLETED' });
    expect(reversePaymentMock).toHaveBeenCalledTimes(1);
  });

  test('STAFF reversal is rejected without calling service → M5_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_FORBIDDEN',
      message: 'Only owners and admins can reverse payments.',
    });
    expect(reversePaymentMock).not.toHaveBeenCalled();
  });

  test('not signed in → ok: false, code M5_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_FORBIDDEN',
      message: 'Only owners and admins can reverse payments.',
    });
    expect(reversePaymentMock).not.toHaveBeenCalled();
  });

  test('bad paymentId UUID → M5_INVALID_INPUT', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const res = await reversePaymentAction(
      undefined,
      mkFormData({ paymentId: 'not-a-uuid' }),
    );
    expect(res).toMatchObject({ ok: false, code: 'M5_INVALID_INPUT' });
    expect(reversePaymentMock).not.toHaveBeenCalled();
  });

  test('bad planId UUID → M5_INVALID_INPUT', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    const res = await reversePaymentAction(
      undefined,
      mkFormData({ planId: 'not-a-uuid' }),
    );
    expect(res).toMatchObject({ ok: false, code: 'M5_INVALID_INPUT' });
    expect(reversePaymentMock).not.toHaveBeenCalled();
  });

  test('service throws PaymentNotFoundError → M5_NOT_FOUND', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockRejectedValue(new PaymentNotFoundError(paymentId));
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_NOT_FOUND',
      message: 'Payment not found.',
    });
  });

  test('service throws CannotReverseReversalRowError → M5_CANNOT_REVERSE_REVERSAL', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockRejectedValue(new CannotReverseReversalRowError(paymentId));
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_CANNOT_REVERSE_REVERSAL',
      message: 'A reversal payment cannot itself be reversed.',
    });
  });

  test('service throws PaymentAlreadyReversedError → M5_ALREADY_REVERSED', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockRejectedValue(new PaymentAlreadyReversedError(paymentId));
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_ALREADY_REVERSED',
      message: 'This payment has already been reversed.',
    });
  });

  test('service throws PaymentRetryableSerializationError once → retried; second call resolves → ok: true', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockResolvedValueOnce({ reversalPaymentId, planStatus: 'ACTIVE' });
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({ ok: true, reversalPaymentId, planStatus: 'ACTIVE' });
    expect(reversePaymentMock).toHaveBeenCalledTimes(2);
  });

  test('service throws PaymentRetryableSerializationError twice → M5_TRY_AGAIN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockRejectedValueOnce(new PaymentRetryableSerializationError());
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_TRY_AGAIN',
      message: 'Could not reverse payment due to a concurrent update. Try again.',
    });
    expect(reversePaymentMock).toHaveBeenCalledTimes(2);
  });

  test('optional reason field is passed through to service', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockResolvedValue({ reversalPaymentId, planStatus: 'ACTIVE' });
    const f = mkFormData({ reason: 'Duplicate entry' });
    await reversePaymentAction(undefined, f);
    const callArg = reversePaymentMock.mock.calls[0]![1];
    expect(callArg.notes).toBe('Duplicate entry');
  });

  test('whitespace-only reason is normalised to undefined', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockResolvedValue({ reversalPaymentId, planStatus: 'ACTIVE' });
    const f = mkFormData({ reason: '   ' });
    await reversePaymentAction(undefined, f);
    const callArg = reversePaymentMock.mock.calls[0]![1];
    expect(callArg.notes).toBeUndefined();
  });

  test('retry → second attempt fails with a mapped (non-serialization) error', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockRejectedValueOnce(new PaymentNotFoundError(paymentId));
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_NOT_FOUND',
      message: 'Payment not found.',
    });
    expect(reversePaymentMock).toHaveBeenCalledTimes(2);
  });

  test('service throws ForbiddenError (role-gate divergence) → M5_FORBIDDEN', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockRejectedValue(new ForbiddenError(['OWNER', 'ADMIN'], 'STAFF'));
    const res = await reversePaymentAction(undefined, mkFormData());
    expect(res).toEqual({
      ok: false,
      code: 'M5_FORBIDDEN',
      message: 'Only owners and admins can reverse payments.',
    });
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(ownerCtx);
    reversePaymentMock.mockRejectedValue(new Error('db explosion'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(reversePaymentAction(undefined, mkFormData())).rejects.toThrow('db explosion');
    errSpy.mockRestore();
  });
});
