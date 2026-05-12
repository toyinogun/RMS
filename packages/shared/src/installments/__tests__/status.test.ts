import { describe, expect, test } from 'vitest';
import { koboFromNaira } from '../../money/index.js';
import { deriveInstallmentStatus } from '../status.js';

const today = new Date('2026-07-15T00:00:00Z');

describe('deriveInstallmentStatus', () => {
  test('zero paid, due in future → PENDING', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PENDING');
  });

  test('zero paid, past due → OVERDUE', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('OVERDUE');
  });

  test('partial paid → PARTIAL regardless of due date', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(40_000),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PARTIAL');
  });

  test('fully paid → PAID', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(100_000),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PAID');
  });

  test('overpaid → PAID (excess belongs on a subsequent row, not here)', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(150_000),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PAID');
  });

  test('WAIVED is a sticky terminal state — never re-derived away', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'WAIVED',
        today,
      }),
    ).toBe('WAIVED');
  });
});
