import { describe, expect, test } from 'vitest';
import { TENANT_TIMEZONE, tenantDayRange } from '../index.js';

describe('tenantDayRange', () => {
  test('TENANT_TIMEZONE is Africa/Lagos', () => {
    expect(TENANT_TIMEZONE).toBe('Africa/Lagos');
  });

  test('returns the local-midnight UTC window for an afternoon "now"', () => {
    const now = new Date('2026-05-17T13:30:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    expect(startUtc.toISOString()).toBe('2026-05-16T23:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
  });

  test('handles a "now" that is already past local midnight in UTC but the same Lagos day', () => {
    const now = new Date('2026-05-18T00:30:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    expect(startUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-18T23:00:00.000Z');
  });

  test('handles a "now" right before local midnight', () => {
    const now = new Date('2026-05-17T22:59:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    expect(startUtc.toISOString()).toBe('2026-05-16T23:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
  });

  test('endUtc is the local midnight of the next Lagos day', () => {
    const { startUtc, endUtc } = tenantDayRange(new Date('2026-05-17T13:30:00.000Z'));
    // 2026-05-17 → next local midnight is 2026-05-18T00:00:00+01:00 == 2026-05-17T23:00:00Z
    expect(endUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
    // And startUtc is local midnight of 2026-05-17 == 2026-05-16T23:00:00Z (already covered above, re-asserted for clarity)
    expect(startUtc.toISOString()).toBe('2026-05-16T23:00:00.000Z');
  });

  test('respects an explicit tz parameter (UTC)', () => {
    const now = new Date('2026-05-17T13:30:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now, 'UTC');
    expect(startUtc.toISOString()).toBe('2026-05-17T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-18T00:00:00.000Z');
  });

  test('handles a DST spring-forward day in Europe/London (23h window)', () => {
    // 2026-03-29: London springs forward 01:00 → 02:00 BST. The local day is 23h long.
    // now = 2026-03-29T12:00:00Z (London 13:00 BST)
    // startUtc = 2026-03-29T00:00:00Z (London 00:00 GMT, before the spring-forward)
    // endUtc   = 2026-03-29T23:00:00Z (London 00:00 BST of 2026-03-30)
    const { startUtc, endUtc } = tenantDayRange(new Date('2026-03-29T12:00:00.000Z'), 'Europe/London');
    expect(startUtc.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect(endUtc.getTime() - startUtc.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});
