import { describe, expect, test } from 'vitest';
import {
  propertyCreateSchema,
  propertyUpdateSchema,
  propertyStatusSchema,
  propertySetStatusSchema,
} from '../schemas.js';

describe('propertyCreateSchema', () => {
  test('accepts a minimal valid property', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-001',
      title: '3-bed terrace',
      addressLine: '12 Marina Road',
      city: 'Lagos',
      totalPriceNgn: '50,000,000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalPriceKobo).toBe(5_000_000_000n);
    }
  });

  test('uppercases code and trims', () => {
    const result = propertyCreateSchema.safeParse({
      code: '  at-001  ',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('AT-001');
  });

  test('rejects code with disallowed characters', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'at 001!',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-positive totalPrice', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-002',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '0',
    });
    expect(result.success).toBe(false);
  });

  test('rejects unparseable totalPrice', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-003',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: 'not money',
    });
    expect(result.success).toBe(false);
  });
});

describe('propertyUpdateSchema', () => {
  test('requires id', () => {
    const result = propertyUpdateSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      code: 'AT-001',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(true);
  });
});

describe('propertyStatusSchema', () => {
  test('accepts AVAILABLE and RESERVED', () => {
    expect(propertyStatusSchema.safeParse('AVAILABLE').success).toBe(true);
    expect(propertyStatusSchema.safeParse('RESERVED').success).toBe(true);
  });

  test('rejects SOLD (M2 cannot transition to SOLD manually)', () => {
    expect(propertyStatusSchema.safeParse('SOLD').success).toBe(false);
  });
});

describe('propertySetStatusSchema', () => {
  test('shape', () => {
    const result = propertySetStatusSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      status: 'RESERVED',
    });
    expect(result.success).toBe(true);
  });
});
