import { describe, expect, test } from 'vitest';
import { koboFromNaira } from '../../money/index.js';
import type { Kobo } from '../../money/index.js';
import { reverse, ReversalInvariantError } from '../reverse.js';

describe('reverse', () => {
  test('single-allocation reversal — negates amount and the one allocation', () => {
    const plan = reverse({
      amountKobo: koboFromNaira(100_000),
      allocations: [{ installmentId: 'inst-1', amountKobo: koboFromNaira(100_000) }],
    });

    expect(plan.amountKobo).toBe(-koboFromNaira(100_000));
    expect(plan.allocations).toEqual([
      { installmentId: 'inst-1', amountKobo: -koboFromNaira(100_000) },
    ]);
  });

  test('multi-allocation reversal — preserves order, each entry negated, top-level sum equals negation of total', () => {
    const original = {
      amountKobo: koboFromNaira(250_000),
      allocations: [
        { installmentId: 'inst-1', amountKobo: koboFromNaira(100_000) },
        { installmentId: 'inst-2', amountKobo: koboFromNaira(100_000) },
        { installmentId: 'inst-3', amountKobo: koboFromNaira(50_000) },
      ],
    };

    const plan = reverse(original);

    expect(plan.amountKobo).toBe(-koboFromNaira(250_000));
    expect(plan.allocations).toEqual([
      { installmentId: 'inst-1', amountKobo: -koboFromNaira(100_000) },
      { installmentId: 'inst-2', amountKobo: -koboFromNaira(100_000) },
      { installmentId: 'inst-3', amountKobo: -koboFromNaira(50_000) },
    ]);

    // Top-level amount equals sum of allocation amounts (both negative)
    const allocSum = plan.allocations.reduce((acc, a) => acc + a.amountKobo, 0n);
    expect(plan.amountKobo).toBe(allocSum);
  });

  test('throws on zero original amount', () => {
    expect(() =>
      reverse({
        amountKobo: 0n as Kobo,
        allocations: [{ installmentId: 'inst-1', amountKobo: 100n as Kobo }],
      }),
    ).toThrow(/amountKobo must be positive/);
  });

  test('throws on negative original amount', () => {
    expect(() =>
      reverse({
        amountKobo: -100n as Kobo,
        allocations: [{ installmentId: 'inst-1', amountKobo: 100n as Kobo }],
      }),
    ).toThrow(/amountKobo must be positive/);
  });

  test('thrown error is an instance of ReversalInvariantError', () => {
    expect(() =>
      reverse({
        amountKobo: 0n as Kobo,
        allocations: [{ installmentId: 'inst-1', amountKobo: 100n as Kobo }],
      }),
    ).toThrow(ReversalInvariantError);
  });

  test('throws on empty allocations', () => {
    expect(() =>
      reverse({
        amountKobo: koboFromNaira(100_000),
        allocations: [],
      }),
    ).toThrow(/allocations must be non-empty/);
  });

  test('throws when allocation amounts do not sum to original amount', () => {
    expect(() =>
      reverse({
        amountKobo: koboFromNaira(100_000),
        allocations: [
          { installmentId: 'inst-1', amountKobo: koboFromNaira(60_000) },
          { installmentId: 'inst-2', amountKobo: koboFromNaira(50_000) },
        ],
      }),
    ).toThrow(/allocations sum/);
  });

  test('throws when an individual allocation amount is non-positive (zero)', () => {
    expect(() =>
      reverse({
        amountKobo: koboFromNaira(100_000),
        allocations: [
          { installmentId: 'inst-1', amountKobo: 0n as Kobo },
          { installmentId: 'inst-2', amountKobo: koboFromNaira(100_000) },
        ],
      }),
    ).toThrow(/allocation amountKobo must be positive/);
  });

  test('throws when an individual allocation amount is negative', () => {
    expect(() =>
      reverse({
        amountKobo: koboFromNaira(100_000),
        allocations: [
          { installmentId: 'inst-1', amountKobo: -50_000n as Kobo },
          { installmentId: 'inst-2', amountKobo: koboFromNaira(150_000) },
        ],
      }),
    ).toThrow(/allocation amountKobo must be positive/);
  });

  test('bigint precision — large kobo values negate exactly', () => {
    // ₦99,999,999.99 = 9_999_999_999 kobo
    const large = 9_999_999_999n as Kobo;
    const plan = reverse({
      amountKobo: large,
      allocations: [{ installmentId: 'inst-big', amountKobo: large }],
    });

    expect(plan.amountKobo).toBe(-large);
    expect(plan.allocations[0]!.amountKobo).toBe(-large);
  });
});
