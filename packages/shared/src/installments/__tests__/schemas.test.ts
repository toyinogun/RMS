import { describe, expect, test } from 'vitest';
import {
  planCreateSchema,
  planCancelSchema,
  planListFilterSchema,
} from '../schemas.js';

const tomorrowIso = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const baseExistingCustomerInput = () => ({
  customer: { mode: 'existing' as const, id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa' },
  propertyId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
  totalPriceNgn: '5,000,000',
  depositNgn: '500,000',
  monthlyNgn: '200,000',
  termMonths: 24,
  startDate: tomorrowIso(),
  depositReceived: false as const,
});

describe('planCreateSchema', () => {
  test('parses valid input with existing customer; NGN strings become BigInt kobo', () => {
    const parsed = planCreateSchema.parse(baseExistingCustomerInput());
    expect(parsed.totalPriceKobo).toBe(500_000_000n);
    expect(parsed.depositKobo).toBe(50_000_000n);
    expect(parsed.monthlyKobo).toBe(20_000_000n);
    expect(parsed.customer).toEqual({ mode: 'existing', id: expect.any(String) });
    expect(parsed.startDate).toBeInstanceOf(Date);
  });

  test('parses valid input with new customer payload', () => {
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      customer: {
        mode: 'new',
        fullName: 'Adaeze Okafor',
        phone: '+2348012345001',
        email: '',
      },
    });
    if (parsed.customer.mode !== 'new') throw new Error('expected new mode');
    expect(parsed.customer.fullName).toBe('Adaeze Okafor');
    expect(parsed.customer.email).toBeUndefined();
  });

  test('rejects negative deposit', () => {
    const res = planCreateSchema.safeParse({ ...baseExistingCustomerInput(), depositNgn: '-1' });
    expect(res.success).toBe(false);
  });

  test('rejects deposit greater than total', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      depositNgn: '6,000,000',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('Deposit cannot exceed total price'))).toBe(true);
    }
  });

  test('rejects underfunded plan (deposit + monthly × term < total)', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      totalPriceNgn: '10,000,000',
      depositNgn: '0',
      monthlyNgn: '100,000',
      termMonths: 6,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('less than the total price'))).toBe(true);
    }
  });

  test('rejects termMonths below 6 or above 36', () => {
    expect(planCreateSchema.safeParse({ ...baseExistingCustomerInput(), termMonths: 5 }).success).toBe(false);
    expect(planCreateSchema.safeParse({ ...baseExistingCustomerInput(), termMonths: 37 }).success).toBe(false);
  });

  test('accepts depositReceived: true with depositMethod (M4)', () => {
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'CASH',
    });
    expect(parsed.depositReceived).toBe(true);
    expect(parsed.depositMethod).toBe('CASH');
    expect(parsed.depositPaidAt).toBeInstanceOf(Date);
  });

  test('rejects depositReceived: true with zero deposit', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      depositNgn: '0',
      depositReceived: true,
      depositMethod: 'CASH',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(
        msgs.some((m) => m.includes('Deposit amount is required when deposit is being recorded')),
      ).toBe(true);
    }
  });

  test('rejects depositReceived: true without depositMethod', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(
        msgs.some((m) => m.includes('Payment method is required when recording a deposit')),
      ).toBe(true);
    }
  });

  test('defaults depositPaidAt to startDate when omitted', () => {
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'TRANSFER',
    });
    expect(parsed.depositPaidAt).toBeInstanceOf(Date);
    expect(parsed.depositPaidAt?.getTime()).toBe(parsed.startDate.getTime());
  });

  test('uses provided depositPaidAt over startDate default', () => {
    const today = new Date().toISOString().slice(0, 10);
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'CASH',
      depositPaidAt: today,
    });
    expect(parsed.depositPaidAt).toBeInstanceOf(Date);
    expect(parsed.depositPaidAt?.toISOString().slice(0, 10)).toBe(today);
    expect(parsed.depositPaidAt?.getTime()).not.toBe(parsed.startDate.getTime());
  });

  test('accepts every payment method value via depositMethod', () => {
    for (const method of ['CASH', 'TRANSFER', 'CHEQUE', 'CARD_MANUAL', 'OTHER'] as const) {
      const parsed = planCreateSchema.parse({
        ...baseExistingCustomerInput(),
        depositReceived: true,
        depositMethod: method,
      });
      expect(parsed.depositMethod).toBe(method);
    }
  });

  test('trims depositReference and depositNotes; empty becomes undefined', () => {
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'CASH',
      depositReference: '  REF-123  ',
      depositNotes: '   ',
    });
    expect(parsed.depositReference).toBe('REF-123');
    expect(parsed.depositNotes).toBeUndefined();
  });

  test('rejects depositReference longer than 100 characters', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'CASH',
      depositReference: 'x'.repeat(101),
    });
    expect(res.success).toBe(false);
  });

  test('rejects depositNotes longer than 500 characters', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      depositReceived: true,
      depositMethod: 'CASH',
      depositNotes: 'x'.repeat(501),
    });
    expect(res.success).toBe(false);
  });

  test('rejects past startDate beyond grace', () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 10);
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      startDate: past.toISOString().slice(0, 10),
    });
    expect(res.success).toBe(false);
  });

  test('accepts startDate of today (grace)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = planCreateSchema.safeParse({ ...baseExistingCustomerInput(), startDate: today });
    expect(res.success).toBe(true);
  });

  test('rejects invalid startDate string', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      startDate: 'not-a-real-date',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.toLowerCase().includes('invalid start date'))).toBe(true);
    }
  });

  test('rejects totalPrice of zero', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      totalPriceNgn: '0',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('Total price must be greater than zero'))).toBe(true);
    }
  });

  test('rejects monthly of zero', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      monthlyNgn: '0',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('Monthly amount must be greater than zero'))).toBe(true);
    }
  });

  test('coerces empty new-customer nationalId and notes to undefined', () => {
    const parsed = planCreateSchema.parse({
      ...baseExistingCustomerInput(),
      customer: {
        mode: 'new',
        fullName: 'Chi Eze',
        phone: '+2348012345002',
        nationalId: '   ',
        notes: '',
      },
    });
    if (parsed.customer.mode !== 'new') throw new Error('expected new mode');
    expect(parsed.customer.nationalId).toBeUndefined();
    expect(parsed.customer.notes).toBeUndefined();
  });

  test('rejects invalid customer.mode value', () => {
    const res = planCreateSchema.safeParse({
      ...baseExistingCustomerInput(),
      customer: { mode: 'bogus' },
    });
    expect(res.success).toBe(false);
  });
});

describe('planCancelSchema', () => {
  test('accepts a uuid', () => {
    expect(
      planCancelSchema.safeParse({ id: '01935b7e-0000-7000-8000-cccccccccccc' }).success,
    ).toBe(true);
  });

  test('rejects non-uuid', () => {
    expect(planCancelSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('planListFilterSchema', () => {
  test('defaults status to ALL when omitted', () => {
    const parsed = planListFilterSchema.parse({});
    expect(parsed.status).toBe('ALL');
    expect(parsed.q).toBeUndefined();
  });

  test('accepts valid status values', () => {
    for (const s of ['DRAFT', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED', 'ALL'] as const) {
      expect(planListFilterSchema.safeParse({ status: s }).success).toBe(true);
    }
  });

  test('trims q and turns empty string into undefined', () => {
    expect(planListFilterSchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(planListFilterSchema.parse({ q: ' adaeze  ' }).q).toBe('adaeze');
  });
});
