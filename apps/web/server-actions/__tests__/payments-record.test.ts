import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tenant-context', () => ({ getTenantContext: vi.fn() }));
vi.mock('@solutio/db/payments-service', () => ({
  recordPayment: vi.fn(),
  PlanNotPayableError: class PlanNotPayableError extends Error {
    constructor(planId: string, status: string) {
      super(`Plan ${planId} is not payable (status: ${status})`);
      this.name = 'PlanNotPayableError';
    }
  },
  PaymentBeforePlanStartError: class PaymentBeforePlanStartError extends Error {
    constructor(paidAt: Date, startDate: Date) {
      super(
        `Payment date ${paidAt.toISOString()} is before plan start date ${startDate.toISOString()}`,
      );
      this.name = 'PaymentBeforePlanStartError';
    }
  },
  PaymentOverpayError: class PaymentOverpayError extends Error {
    readonly overpayKobo: bigint;
    constructor(overpayKobo: bigint) {
      super(`Payment exceeds plan outstanding by ${overpayKobo} kobo`);
      this.name = 'PaymentOverpayError';
      this.overpayKobo = overpayKobo;
    }
  },
  AllocationInstallmentNotFoundError: class AllocationInstallmentNotFoundError extends Error {
    constructor(id: string) {
      super(`Allocation references unknown installment ${id}`);
      this.name = 'AllocationInstallmentNotFoundError';
    }
  },
  AllocationAgainstPaidInstallmentError: class AllocationAgainstPaidInstallmentError extends Error {
    readonly sequenceNo: number;
    constructor(sequenceNo: number) {
      super(`Installment #${sequenceNo} is already paid`);
      this.name = 'AllocationAgainstPaidInstallmentError';
      this.sequenceNo = sequenceNo;
    }
  },
  AllocationExceedsOutstandingError: class AllocationExceedsOutstandingError extends Error {
    readonly sequenceNo: number;
    constructor(sequenceNo: number) {
      super(`Allocation for installment #${sequenceNo} exceeds outstanding`);
      this.name = 'AllocationExceedsOutstandingError';
      this.sequenceNo = sequenceNo;
    }
  },
  AllocationDuplicateInstallmentError: class AllocationDuplicateInstallmentError extends Error {
    constructor(id: string) {
      super(`Allocation list contains installment ${id} more than once`);
      this.name = 'AllocationDuplicateInstallmentError';
    }
  },
  PaymentRetryableSerializationError: class PaymentRetryableSerializationError extends Error {
    constructor() {
      super('Payment transaction failed due to serialization conflict — retry');
      this.name = 'PaymentRetryableSerializationError';
    }
  },
}));
vi.mock('@solutio/db/plan-errors', () => ({
  PlanNotFoundError: class PlanNotFoundError extends Error {
    constructor(id: string) {
      super(`Plan not found: ${id}`);
      this.name = 'PlanNotFoundError';
    }
  },
}));
vi.mock('@solutio/db/client', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getTenantContext } from '@/lib/tenant-context';
import {
  recordPayment,
  PlanNotPayableError,
  PaymentBeforePlanStartError,
  PaymentOverpayError,
  AllocationInstallmentNotFoundError,
  AllocationAgainstPaidInstallmentError,
  AllocationDuplicateInstallmentError,
  AllocationExceedsOutstandingError,
  PaymentRetryableSerializationError,
} from '@solutio/db/payments-service';
import { PlanNotFoundError } from '@solutio/db/plan-errors';
import { revalidatePath } from 'next/cache';
import { recordPaymentAction } from '../payments/record';

const getTenantContextMock = vi.mocked(getTenantContext);
const recordPaymentMock = vi.mocked(recordPayment);
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

const planId = '550e8400-e29b-41d4-a716-446655440000';
const paymentId = '550e8400-e29b-41d4-a716-446655440010';
const installmentId1 = '550e8400-e29b-41d4-a716-446655440020';
const installmentId2 = '550e8400-e29b-41d4-a716-446655440021';

const today = () => new Date().toISOString().slice(0, 10);

function mkFormData(overrides: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    planId,
    amountNgn: '50,000',
    paidAt: today(),
    method: 'CASH',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) f.append(k, v);
  return f;
}

function mkAllocFormData(rows: Array<{ installmentId: string; amountNgn: string }>, amount: string): FormData {
  const f = mkFormData({ amountNgn: amount });
  rows.forEach((row, i) => {
    f.append(`allocations[${i}].installmentId`, row.installmentId);
    f.append(`allocations[${i}].amountNgn`, row.amountNgn);
  });
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordPaymentAction', () => {
  test('returns Not signed in when ctx is null', async () => {
    getTenantContextMock.mockResolvedValue(null);
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({ ok: false, message: 'Not signed in' });
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  test('returns Forbidden when role is outside OWNER/ADMIN/STAFF', async () => {
    // No additional role beyond OWNER/ADMIN/STAFF exists in the type, but the
    // runtime check is `allowed.includes(ctx.user.role)`. Cast to exercise
    // the gate when a future role is added or a malformed ctx slips through.
    const guestCtx = {
      ...staffCtx,
      user: { ...staffCtx.user, role: 'GUEST' as unknown as 'STAFF' },
    };
    getTenantContextMock.mockResolvedValue(guestCtx);
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({ ok: false, message: 'Forbidden' });
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  test('returns fieldErrors when amountNgn is 0', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const res = await recordPaymentAction(null, mkFormData({ amountNgn: '0' }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
      expect(res.fieldErrors!.amountNgn).toMatch(/greater than zero/i);
    }
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  test('FIFO happy path: no allocation fields → service called with allocations undefined; revalidates 3 paths', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockResolvedValue({
      paymentId,
      planStatus: 'ACTIVE',
      remainderKobo: 0n as never,
    });
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({ ok: true, data: { paymentId, planStatus: 'ACTIVE' } });
    expect(recordPaymentMock).toHaveBeenCalledTimes(1);
    const callArg = recordPaymentMock.mock.calls[0]![1];
    expect(callArg.allocations).toBeUndefined();
    expect(callArg.amountKobo).toBe(50_000_00n);
    expect(callArg.planId).toBe(planId);
    expect(callArg.method).toBe('CASH');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/plans/${planId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans');
    expect(revalidatePathMock).toHaveBeenCalledWith('/properties');
  });

  test('Manual override happy path: two rows summing to amount → service called with array of two bigint allocations', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockResolvedValue({
      paymentId,
      planStatus: 'ACTIVE',
      remainderKobo: 0n as never,
    });
    const f = mkAllocFormData(
      [
        { installmentId: installmentId1, amountNgn: '30,000' },
        { installmentId: installmentId2, amountNgn: '20,000' },
      ],
      '50,000',
    );
    const res = await recordPaymentAction(null, f);
    expect(res.ok).toBe(true);
    const callArg = recordPaymentMock.mock.calls[0]![1];
    expect(Array.isArray(callArg.allocations)).toBe(true);
    expect(callArg.allocations).toHaveLength(2);
    expect(callArg.allocations![0]).toEqual({
      installmentId: installmentId1,
      amountKobo: 30_000_00n,
    });
    expect(callArg.allocations![1]).toEqual({
      installmentId: installmentId2,
      amountKobo: 20_000_00n,
    });
  });

  test('half-filled allocation row (installmentId only, missing amountNgn) reaches schema and returns fieldErrors, not 500', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    const f = mkFormData();
    f.append('allocations[0].installmentId', installmentId1);
    // Intentionally omit allocations[0].amountNgn
    const res = await recordPaymentAction(null, f);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
    }
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  test('maps PaymentOverpayError to amountNgn fieldError with formatted Naira', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new PaymentOverpayError(123_45n as bigint & { readonly __brand: 'Kobo' }));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
      expect(res.fieldErrors!.amountNgn).toBe(
        'Payment exceeds outstanding balance by ₦123.45.',
      );
    }
  });

  test('maps AllocationAgainstPaidInstallmentError with sequenceNo in message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new AllocationAgainstPaidInstallmentError(3));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain('#3');
      expect(res.message).toMatch(/already paid/i);
    }
  });

  test('maps PlanNotPayableError to a not-payable message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new PlanNotPayableError(planId, 'COMPLETED'));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({
      ok: false,
      message: 'This plan no longer accepts payments.',
    });
  });

  test('maps PaymentBeforePlanStartError to a paidAt fieldError', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(
      new PaymentBeforePlanStartError(new Date('2026-01-01'), new Date('2026-02-01')),
    );
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors).toBeDefined();
      expect(res.fieldErrors!.paidAt).toMatch(/before plan start/i);
    }
  });

  test('maps AllocationDuplicateInstallmentError to a refresh-and-try message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new AllocationDuplicateInstallmentError(installmentId1));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/twice/i);
    }
  });

  test('retries once on PaymentRetryableSerializationError and succeeds', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockResolvedValueOnce({
        paymentId,
        planStatus: 'ACTIVE',
        remainderKobo: 0n as never,
      });
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({ ok: true, data: { paymentId, planStatus: 'ACTIVE' } });
    expect(recordPaymentMock).toHaveBeenCalledTimes(2);
  });

  test('returns friendly message when both attempts fail with serialization error', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockRejectedValueOnce(new PaymentRetryableSerializationError());
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({
      ok: false,
      message: 'Could not record payment due to a concurrent update. Try again.',
    });
    expect(recordPaymentMock).toHaveBeenCalledTimes(2);
  });

  test('maps PlanNotFoundError to a not-exists message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new PlanNotFoundError(planId));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({ ok: false, message: 'Plan no longer exists.' });
  });

  test('maps AllocationInstallmentNotFoundError to a refresh message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new AllocationInstallmentNotFoundError(installmentId1));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/unknown installment/i);
    }
  });

  test('maps AllocationExceedsOutstandingError with sequenceNo in message', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new AllocationExceedsOutstandingError(2));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain('#2');
      expect(res.message).toMatch(/exceeds/i);
    }
  });

  test('retry → second attempt fails with a mapped (non-serialization) error', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock
      .mockRejectedValueOnce(new PaymentRetryableSerializationError())
      .mockRejectedValueOnce(new PlanNotPayableError(planId, 'COMPLETED'));
    const res = await recordPaymentAction(null, mkFormData());
    expect(res).toEqual({
      ok: false,
      message: 'This plan no longer accepts payments.',
    });
    expect(recordPaymentMock).toHaveBeenCalledTimes(2);
  });

  test('re-throws unexpected errors', async () => {
    getTenantContextMock.mockResolvedValue(staffCtx);
    recordPaymentMock.mockRejectedValue(new Error('boom'));
    // Suppress the expected console.error from the unknown-error branch.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordPaymentAction(null, mkFormData())).rejects.toThrow('boom');
    errSpy.mockRestore();
  });
});
