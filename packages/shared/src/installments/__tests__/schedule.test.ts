import { describe, expect, test } from 'vitest';
import { koboFromNaira, sumKobo } from '../../money/index.js';
import type { Kobo } from '../../money/index.js';
import { generateSchedule } from '../schedule.js';

describe('generateSchedule', () => {
  test('emits sequenceNo=0 deposit followed by termMonths monthlies', () => {
    const rows = generateSchedule({
      totalPriceKobo: koboFromNaira(12_000_000),
      depositKobo: koboFromNaira(2_400_000),
      monthlyKobo: koboFromNaira(800_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(rows).toHaveLength(13);
    expect(rows[0]!.sequenceNo).toBe(0);
    expect(rows[0]!.amountDueKobo).toBe(koboFromNaira(2_400_000));
    expect(rows[12]!.sequenceNo).toBe(12);
  });

  test('schedule sum equals totalPriceKobo exactly', () => {
    const total = koboFromNaira(15_000_000);
    const rows = generateSchedule({
      totalPriceKobo: total,
      depositKobo: koboFromNaira(3_000_000),
      monthlyKobo: koboFromNaira(1_000_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(sumKobo(rows.map((r) => r.amountDueKobo))).toBe(total);
  });

  test('rounding remainder is absorbed by the final installment', () => {
    const total = koboFromNaira(10_000_000);
    const rows = generateSchedule({
      totalPriceKobo: total,
      depositKobo: koboFromNaira(1_000_000),
      monthlyKobo: 128_571_400n as Kobo,
      termMonths: 7,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(rows).toHaveLength(8);
    expect(sumKobo(rows.map((r) => r.amountDueKobo))).toBe(total);
    const monthlies = rows.slice(1);
    expect(monthlies.slice(0, 6).every((r) => r.amountDueKobo === 128_571_400n)).toBe(true);
    expect(monthlies[6]!.amountDueKobo).toBeGreaterThan(128_571_400n);
  });

  test('dueDate increments by month from startDate, deposit due on startDate', () => {
    const rows = generateSchedule({
      totalPriceKobo: koboFromNaira(6_400_000),
      depositKobo: koboFromNaira(400_000),
      monthlyKobo: koboFromNaira(1_000_000),
      termMonths: 6,
      startDate: new Date('2026-06-15T00:00:00Z'),
    });
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  test('rejects termMonths < 6', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(100_000),
        monthlyKobo: koboFromNaira(180_000),
        termMonths: 5,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/termMonths/);
  });

  test('rejects termMonths > 36', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(50_000_000),
        depositKobo: koboFromNaira(5_000_000),
        monthlyKobo: koboFromNaira(1_200_000),
        termMonths: 37,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/termMonths/);
  });

  test('rejects depositKobo > totalPriceKobo', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(2_000_000),
        monthlyKobo: koboFromNaira(100_000),
        termMonths: 6,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/depositKobo/);
  });

  test('rejects monthlyKobo * termMonths + deposit < total (would underfund)', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(100_000),
        monthlyKobo: koboFromNaira(50_000),
        termMonths: 6,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/underfund/);
  });
});
