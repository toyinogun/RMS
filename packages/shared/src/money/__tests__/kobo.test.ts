import { describe, expect, test } from 'vitest';
import { formatKobo, koboFromNaira, koboToNaira, sumKobo } from '../kobo.js';
import type { Kobo } from '../kobo.js';

describe('Kobo brand', () => {
  test('koboFromNaira converts whole naira', () => {
    expect(koboFromNaira(100)).toBe(10_000n as Kobo);
  });

  test('koboFromNaira converts fractional naira (kobo-precise)', () => {
    expect(koboFromNaira(99.5)).toBe(9_950n as Kobo);
  });

  test('koboFromNaira rounds half-even on sub-kobo input', () => {
    expect(koboFromNaira(0.005)).toBe(0n as Kobo);
    expect(koboFromNaira(0.015)).toBe(2n as Kobo);
    expect(koboFromNaira(0.025)).toBe(2n as Kobo);
  });

  test('koboFromNaira rejects negative zero spam', () => {
    expect(koboFromNaira(-0)).toBe(0n as Kobo);
  });

  test('koboToNaira returns plain number for display', () => {
    expect(koboToNaira(25_000_050n as Kobo)).toBe(250_000.5);
  });

  test('formatKobo renders Nigerian Naira', () => {
    expect(formatKobo(25_000_050n as Kobo)).toBe('₦250,000.50');
    expect(formatKobo(0n as Kobo)).toBe('₦0.00');
    expect(formatKobo(99n as Kobo)).toBe('₦0.99');
  });

  test('formatKobo handles negatives (reversal rows)', () => {
    expect(formatKobo(-25_000_050n as Kobo)).toBe('-₦250,000.50');
  });

  test('sumKobo adds an array', () => {
    expect(sumKobo([100n, 200n, 300n] as Kobo[])).toBe(600n as Kobo);
    expect(sumKobo([] as Kobo[])).toBe(0n as Kobo);
  });

  test('large amounts (₦100M+)', () => {
    const huge = koboFromNaira(100_000_000);
    expect(huge).toBe(10_000_000_000n as Kobo);
    expect(formatKobo(huge)).toBe('₦100,000,000.00');
  });
});
