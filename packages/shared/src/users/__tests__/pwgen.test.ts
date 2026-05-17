import { describe, expect, test } from 'vitest';
import { generateTempPassword } from '../pwgen.js';

describe('generateTempPassword', () => {
  test('returns a 16-character string', () => {
    const password = generateTempPassword();
    expect(password).toHaveLength(16);
    expect(typeof password).toBe('string');
  });

  test('100 invocations all contain no ambiguous characters (0, O, I, l, 1)', () => {
    const ambiguousChars = ['0', 'O', 'I', 'l', '1'];
    for (let i = 0; i < 100; i++) {
      const password = generateTempPassword();
      for (const char of ambiguousChars) {
        expect(password).not.toContain(char);
      }
    }
  });

  test('100 invocations all meet character-class invariants (>=2 lower, >=2 upper, >=2 digits, >=1 special)', () => {
    const specialChars = /[!@#$%^&*]/;
    for (let i = 0; i < 100; i++) {
      const password = generateTempPassword();

      const lowerCount = (password.match(/[a-z]/g) || []).length;
      const upperCount = (password.match(/[A-Z]/g) || []).length;
      const digitCount = (password.match(/[0-9]/g) || []).length;
      const hasSpecial = specialChars.test(password);

      expect(lowerCount).toBeGreaterThanOrEqual(2);
      expect(upperCount).toBeGreaterThanOrEqual(2);
      expect(digitCount).toBeGreaterThanOrEqual(2);
      expect(hasSpecial).toBe(true);
    }
  });

  test('all 100 invocations produce distinct passwords (no obvious pattern)', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const password = generateTempPassword();
      passwords.add(password);
    }
    expect(passwords.size).toBe(100);
  });
});
