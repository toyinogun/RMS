import { describe, expect, test } from 'vitest';
import { TENANT_TIMEZONE, tenantDayRange } from '../index.ts';

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

  test('window is exactly 24 hours wide', () => {
    const { startUtc, endUtc } = tenantDayRange(new Date('2026-05-17T13:30:00.000Z'));
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
