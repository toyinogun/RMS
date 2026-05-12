import { describe, expect, test } from 'vitest';
import { koboFromNaira } from '../../money/index.js';
import type { Kobo } from '../../money/index.js';
import { allocatePayment } from '../allocate.js';

function inst(seq: number, due: Kobo, paid: Kobo = 0n as Kobo) {
  return {
    id: `inst-${seq}`,
    sequenceNo: seq,
    amountDueKobo: due,
    amountPaidKobo: paid,
  };
}

describe('allocatePayment', () => {
  test('one payment fully covers one installment', () => {
    const result = allocatePayment(koboFromNaira(100_000), [inst(0, koboFromNaira(100_000))]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(100_000) },
    ]);
    expect(result.remainderKobo).toBe(0n);
  });

  test('one payment spans multiple installments in sequence order', () => {
    const result = allocatePayment(koboFromNaira(250_000), [
      inst(0, koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
      inst(2, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(100_000) },
      { installmentId: 'inst-1', amountKobo: koboFromNaira(100_000) },
      { installmentId: 'inst-2', amountKobo: koboFromNaira(50_000) },
    ]);
    expect(result.remainderKobo).toBe(0n);
  });

  test('skips installments already fully paid', () => {
    const result = allocatePayment(koboFromNaira(80_000), [
      inst(0, koboFromNaira(100_000), koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-1', amountKobo: koboFromNaira(80_000) },
    ]);
  });

  test('credits partial-paid installments before moving on', () => {
    const result = allocatePayment(koboFromNaira(150_000), [
      inst(0, koboFromNaira(100_000), koboFromNaira(40_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(60_000) },
      { installmentId: 'inst-1', amountKobo: koboFromNaira(90_000) },
    ]);
  });

  test('overpayment is returned as remainder, not silently dropped', () => {
    const result = allocatePayment(koboFromNaira(500_000), [
      inst(0, koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations.map((a) => a.amountKobo)).toEqual([
      koboFromNaira(100_000),
      koboFromNaira(100_000),
    ]);
    expect(result.remainderKobo).toBe(koboFromNaira(300_000));
  });

  test('rejects negative amount via thrown error (use reversal flow instead)', () => {
    expect(() =>
      allocatePayment(-100n as Kobo, [inst(0, koboFromNaira(100_000))]),
    ).toThrow(/negative/);
  });

  test('rejects zero amount', () => {
    expect(() =>
      allocatePayment(0n as Kobo, [inst(0, koboFromNaira(100_000))]),
    ).toThrow(/zero/);
  });
});
