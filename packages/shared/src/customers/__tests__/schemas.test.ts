import { describe, expect, test } from 'vitest';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerIdSchema,
} from '../schemas.js';

describe('customerCreateSchema', () => {
  test('accepts a minimal valid customer (fullName + phone)', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'Adaeze Okafor',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Adaeze Okafor');
      expect(result.data.phone).toBe('+2348012345001');
      expect(result.data.email).toBeUndefined();
      expect(result.data.nationalId).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  test('trims surrounding whitespace on fullName and phone', () => {
    const result = customerCreateSchema.safeParse({
      fullName: '  Adaeze Okafor  ',
      phone: '  +2348012345001  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Adaeze Okafor');
      expect(result.data.phone).toBe('+2348012345001');
    }
  });

  test('rejects empty fullName', () => {
    const result = customerCreateSchema.safeParse({ fullName: '   ', phone: '+2348012345001' });
    expect(result.success).toBe(false);
  });

  test('rejects phone shorter than 7 chars after trim', () => {
    const result = customerCreateSchema.safeParse({ fullName: 'A', phone: '12345' });
    expect(result.success).toBe(false);
  });

  test('rejects invalid email when email is provided', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  test('accepts empty-string email as undefined (form convenience)', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      email: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  test('caps notes at 1000 chars', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe('customerUpdateSchema', () => {
  test('requires id alongside all other fields', () => {
    const result = customerUpdateSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      fullName: 'Renamed',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(true);
  });

  test('rejects malformed UUID', () => {
    const result = customerUpdateSchema.safeParse({
      id: 'not-a-uuid',
      fullName: 'A',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(false);
  });
});

describe('customerIdSchema', () => {
  test('accepts a valid UUID', () => {
    const result = customerIdSchema.safeParse({ id: '01935b7e-0000-7000-8000-000000000abc' });
    expect(result.success).toBe(true);
  });
});
