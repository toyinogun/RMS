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

  test('rejects depositReceived: true with the M4 hint', () => {
    const res = planCreateSchema.safeParse({ ...baseExistingCustomerInput(), depositReceived: true });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msgs = res.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('M4'))).toBe(true);
    }
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
