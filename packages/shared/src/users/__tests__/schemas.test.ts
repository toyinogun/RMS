import { describe, expect, test } from 'vitest';
import { userCreateSchema, userIdSchema } from '../schemas.js';

describe('userCreateSchema', () => {
  test('accepts a minimal valid input with email, name, and role', () => {
    const result = userCreateSchema.safeParse({
      email: 'alice@example.com',
      name: 'Alice',
      role: 'STAFF',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('alice@example.com');
      expect(result.data.name).toBe('Alice');
      expect(result.data.role).toBe('STAFF');
    }
  });

  test('accepts role ADMIN', () => {
    const result = userCreateSchema.safeParse({
      email: 'bob@example.com',
      name: 'Bob',
      role: 'ADMIN',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('ADMIN');
    }
  });

  test('rejects role OWNER (intentionally absent from enum)', () => {
    const result = userCreateSchema.safeParse({
      email: 'charlie@example.com',
      name: 'Charlie',
      role: 'OWNER',
    });
    expect(result.success).toBe(false);
  });

  test('rejects when role is unset', () => {
    const result = userCreateSchema.safeParse({
      email: 'dave@example.com',
      name: 'Dave',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty name', () => {
    const result = userCreateSchema.safeParse({
      email: 'eve@example.com',
      name: '',
      role: 'STAFF',
    });
    expect(result.success).toBe(false);
  });

  test('rejects whitespace-only name', () => {
    const result = userCreateSchema.safeParse({
      email: 'frank@example.com',
      name: '   ',
      role: 'STAFF',
    });
    expect(result.success).toBe(false);
  });

  test('rejects name exceeding 120 characters', () => {
    const result = userCreateSchema.safeParse({
      email: 'grace@example.com',
      name: 'a'.repeat(121),
      role: 'STAFF',
    });
    expect(result.success).toBe(false);
  });

  test('accepts name at exactly 120 characters', () => {
    const result = userCreateSchema.safeParse({
      email: 'henry@example.com',
      name: 'a'.repeat(120),
      role: 'STAFF',
    });
    expect(result.success).toBe(true);
  });

  test('rejects non-email email', () => {
    const result = userCreateSchema.safeParse({
      email: 'not-an-email',
      name: 'Ivy',
      role: 'STAFF',
    });
    expect(result.success).toBe(false);
  });

  test('rejects email without domain', () => {
    const result = userCreateSchema.safeParse({
      email: 'user@',
      name: 'Jack',
      role: 'STAFF',
    });
    expect(result.success).toBe(false);
  });

  test('trims whitespace on name', () => {
    const result = userCreateSchema.safeParse({
      email: 'kate@example.com',
      name: '  Alice Trimmed  ',
      role: 'STAFF',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice Trimmed');
    }
  });

  test('trims whitespace on email', () => {
    const result = userCreateSchema.safeParse({
      email: '  leo@example.com  ',
      name: 'Leo',
      role: 'STAFF',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('leo@example.com');
    }
  });
});

describe('userIdSchema', () => {
  test('accepts a valid UUID', () => {
    const result = userIdSchema.safeParse({
      userId: '01935b7e-0000-7000-8000-000000000abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe('01935b7e-0000-7000-8000-000000000abc');
    }
  });

  test('rejects malformed UUID', () => {
    const result = userIdSchema.safeParse({
      userId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty string', () => {
    const result = userIdSchema.safeParse({
      userId: '',
    });
    expect(result.success).toBe(false);
  });
});
