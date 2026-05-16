import { describe, expect, test } from 'vitest';
import { paymentRecordSchema, paymentReversalSchema } from '../schemas.js';

const PLAN_ID = '01935b7e-0000-7000-8000-aaaaaaaaaaaa';
const INST_A = '01935b7e-0000-7000-8000-bbbbbbbbbbbb';
const INST_B = '01935b7e-0000-7000-8000-cccccccccccc';

const todayIso = () => new Date().toISOString();
const yesterdayIso = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
};
const daysFromNowIso = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

const baseInput = () => ({
  planId: PLAN_ID,
  amountNgn: '500,000',
  paidAt: todayIso(),
  method: 'CASH' as const,
});

describe('paymentRecordSchema', () => {
  test('parses minimal valid input (no allocations)', () => {
    const parsed = paymentRecordSchema.parse(baseInput());
    expect(parsed.planId).toBe(PLAN_ID);
    expect(parsed.amountKobo).toBe(50_000_000n);
    expect(typeof parsed.amountKobo).toBe('bigint');
    expect(parsed.paidAt).toBeInstanceOf(Date);
    expect(parsed.method).toBe('CASH');
    expect(parsed.reference).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
    expect(parsed.allocations).toBeUndefined();
  });

  test('parses valid input with explicit allocations whose sum equals amount', () => {
    const parsed = paymentRecordSchema.parse({
      ...baseInput(),
      amountNgn: '500,000',
      allocations: [
        { installmentId: INST_A, amountNgn: '200,000' },
        { installmentId: INST_B, amountNgn: '300,000' },
      ],
    });
    expect(parsed.allocations).toHaveLength(2);
    expect(parsed.allocations![0]!.installmentId).toBe(INST_A);
    expect(parsed.allocations![0]!.amountKobo).toBe(20_000_000n);
    expect(parsed.allocations![1]!.amountKobo).toBe(30_000_000n);
  });

  test('rejects amountNgn = "0"', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), amountNgn: '0' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /greater than zero/i.test(i.message))).toBe(true);
    }
  });

  test('rejects negative amountNgn', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), amountNgn: '-100' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /greater than zero/i.test(i.message))).toBe(true);
    }
  });

  test('accepts paidAt exactly at the 1-day grace boundary', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: daysFromNowIso(1) });
    expect(res.success).toBe(true);
  });

  test('rejects allocation row with negative amount', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      amountNgn: '100,000',
      allocations: [{ installmentId: INST_A, amountNgn: '-100' }],
    });
    expect(res.success).toBe(false);
  });

  test('rejects malformed NGN string', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), amountNgn: 'abc' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /invalid amount/i.test(i.message))).toBe(true);
    }
  });

  test('rejects future paidAt beyond 1-day grace', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: daysFromNowIso(3) });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /future/i.test(i.message))).toBe(true);
    }
  });

  test('accepts paidAt of today', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: todayIso() });
    expect(res.success).toBe(true);
  });

  test('accepts paidAt of yesterday', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: yesterdayIso() });
    expect(res.success).toBe(true);
  });

  test('rejects invalid paidAt string', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: 'not-a-date' });
    expect(res.success).toBe(false);
  });

  test('rejects empty paidAt', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), paidAt: '   ' });
    expect(res.success).toBe(false);
  });

  test('rejects empty allocations array', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), allocations: [] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /non-empty|omitted/i.test(i.message))).toBe(true);
    }
  });

  test('rejects allocations that sum to a different total than amountNgn', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      amountNgn: '500,000',
      allocations: [
        { installmentId: INST_A, amountNgn: '100,000' },
        { installmentId: INST_B, amountNgn: '300,000' },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /sum/i.test(i.message))).toBe(true);
    }
  });

  test('rejects allocation row with amount <= 0', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      amountNgn: '500,000',
      allocations: [
        { installmentId: INST_A, amountNgn: '0' },
        { installmentId: INST_B, amountNgn: '500,000' },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /greater than zero/i.test(i.message))).toBe(true);
    }
  });

  test('accepts each valid method enum value', () => {
    for (const method of ['CASH', 'TRANSFER', 'CHEQUE', 'CARD_MANUAL', 'OTHER'] as const) {
      const res = paymentRecordSchema.safeParse({ ...baseInput(), method });
      expect(res.success).toBe(true);
    }
  });

  test('rejects unknown method', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), method: 'CRYPTO' });
    expect(res.success).toBe(false);
  });

  test('trims reference and coerces empty string to undefined', () => {
    const parsed = paymentRecordSchema.parse({
      ...baseInput(),
      reference: '  REF-001  ',
      notes: '',
    });
    expect(parsed.reference).toBe('REF-001');
    expect(parsed.notes).toBeUndefined();
  });

  test('trims notes and coerces empty string to undefined', () => {
    const parsed = paymentRecordSchema.parse({
      ...baseInput(),
      reference: '',
      notes: '  some notes  ',
    });
    expect(parsed.reference).toBeUndefined();
    expect(parsed.notes).toBe('some notes');
  });

  test('rejects reference longer than 100 chars', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      reference: 'r'.repeat(101),
    });
    expect(res.success).toBe(false);
  });

  test('rejects notes longer than 500 chars', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      notes: 'n'.repeat(501),
    });
    expect(res.success).toBe(false);
  });

  test('rejects non-uuid installmentId in an allocation row', () => {
    const res = paymentRecordSchema.safeParse({
      ...baseInput(),
      allocations: [{ installmentId: 'not-a-uuid', amountNgn: '500,000' }],
    });
    expect(res.success).toBe(false);
  });

  test('rejects non-uuid planId', () => {
    const res = paymentRecordSchema.safeParse({ ...baseInput(), planId: 'not-a-uuid' });
    expect(res.success).toBe(false);
  });
});

const PAYMENT_ID = '01935b7e-0000-7000-8000-dddddddddddd';

describe('paymentReversalSchema', () => {
  test('parses minimal input (paymentId only, no reason)', () => {
    const parsed = paymentReversalSchema.parse({ paymentId: PAYMENT_ID });
    expect(parsed.paymentId).toBe(PAYMENT_ID);
    expect(parsed.reason).toBeUndefined();
  });

  test('parses input with reason', () => {
    const parsed = paymentReversalSchema.parse({
      paymentId: PAYMENT_ID,
      reason: 'Customer requested refund',
    });
    expect(parsed.paymentId).toBe(PAYMENT_ID);
    expect(parsed.reason).toBe('Customer requested refund');
  });

  test('rejects non-uuid paymentId', () => {
    const res = paymentReversalSchema.safeParse({ paymentId: 'not-a-uuid' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /invalid payment id/i.test(i.message))).toBe(true);
    }
  });

  test('rejects reason longer than 500 chars', () => {
    const res = paymentReversalSchema.safeParse({
      paymentId: PAYMENT_ID,
      reason: 'r'.repeat(501),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => /500 characters or fewer/i.test(i.message))).toBe(true);
    }
  });

  test('trims reason and treats whitespace-only as absent (undefined)', () => {
    const parsed = paymentReversalSchema.parse({
      paymentId: PAYMENT_ID,
      reason: '   ',
    });
    expect(parsed.reason).toBeUndefined();
  });

  test('trims leading/trailing whitespace from reason', () => {
    const parsed = paymentReversalSchema.parse({
      paymentId: PAYMENT_ID,
      reason: '  duplicate payment  ',
    });
    expect(parsed.reason).toBe('duplicate payment');
  });

  test('accepts reason exactly at 500 chars', () => {
    const res = paymentReversalSchema.safeParse({
      paymentId: PAYMENT_ID,
      reason: 'r'.repeat(500),
    });
    expect(res.success).toBe(true);
  });

});
