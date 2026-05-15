import { describe, expect, test } from 'vitest';
import { formatKobo } from '../kobo.js';
import { parseNgn } from '../parse.js';
import type { Kobo } from '../kobo.js';

describe('parseNgn', () => {
  test('parses plain integer string', () => {
    expect(parseNgn('833333')).toBe(83_333_300n as Kobo);
  });

  test('parses comma-grouped integer', () => {
    expect(parseNgn('833,333')).toBe(83_333_300n as Kobo);
  });

  test('parses ₦ prefix', () => {
    expect(parseNgn('₦833,333')).toBe(83_333_300n as Kobo);
  });

  test('parses ₦ prefix with whitespace', () => {
    expect(parseNgn('₦ 833,333')).toBe(83_333_300n as Kobo);
  });

  test('parses two-decimal kobo precision', () => {
    expect(parseNgn('833,333.50')).toBe(83_333_350n as Kobo);
  });

  test('parses one-decimal kobo precision', () => {
    expect(parseNgn('100.5')).toBe(10_050n as Kobo);
  });

  test('parses negative amount (reversal display)', () => {
    expect(parseNgn('-1,000')).toBe(-100_000n as Kobo);
  });

  test('parses ₦-prefixed negative', () => {
    expect(parseNgn('-₦1,000')).toBe(-100_000n as Kobo);
  });

  test('parses zero', () => {
    expect(parseNgn('0')).toBe(0n as Kobo);
    expect(parseNgn('₦0.00')).toBe(0n as Kobo);
  });

  test('rejects empty string', () => {
    expect(() => parseNgn('')).toThrow(/empty/i);
    expect(() => parseNgn('   ')).toThrow(/empty/i);
  });

  test('rejects non-numeric garbage', () => {
    expect(() => parseNgn('abc')).toThrow(/invalid/i);
    expect(() => parseNgn('1,2,3,4')).toThrow(/invalid/i);
    expect(() => parseNgn('1.2.3')).toThrow(/invalid/i);
  });

  test('rejects sub-kobo precision', () => {
    expect(() => parseNgn('1.234')).toThrow(/sub-kobo|precision/i);
  });

  test('parseNgn ∘ formatKobo is identity for representative values', () => {
    const samples = [0n, 1n, 99n, 100n, 10_000n, 12_345_678n, 100_000_000_000n] as Kobo[];
    for (const k of samples) {
      expect(parseNgn(formatKobo(k))).toBe(k);
    }
  });

  test('parseNgn ∘ formatKobo handles negatives', () => {
    const samples = [-1n, -100n, -25_000_050n] as Kobo[];
    for (const k of samples) {
      expect(parseNgn(formatKobo(k))).toBe(k);
    }
  });
});
