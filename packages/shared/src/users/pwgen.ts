import { randomBytes } from 'node:crypto';

const LOWERCASE = 'abcdefghjkmnpqrstvwxyz';
const UPPERCASE = 'ABCDEFGHJKMNPQRSTVWXYZ';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*';

const ALL_CHARS = LOWERCASE + UPPERCASE + DIGITS + SPECIAL;

/**
 * Generates a cryptographically secure temporary password.
 *
 * The password is 16 characters long and is guaranteed to contain:
 * - At least 2 lowercase letters
 * - At least 2 uppercase letters
 * - At least 2 digits
 * - At least 1 special character (!@#$%^&*)
 *
 * Ambiguous characters (0, O, I, l, 1) are excluded.
 * Uses node:crypto.randomBytes for secure randomness.
 *
 * @returns A 16-character temporary password.
 * @throws Error if unable to generate a valid password after 100 attempts.
 */
export function generateTempPassword(): string {
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const password = generateCandidate();

    if (isValidPassword(password)) {
      return password;
    }
  }

  throw new Error('Failed to generate valid temporary password after 100 attempts');
}

function generateCandidate(): string {
  const bytes = randomBytes(16);
  let result = '';

  for (let i = 0; i < 16; i++) {
    const byte = bytes[i] as number;
    const index = byte % ALL_CHARS.length;
    result += ALL_CHARS[index];
  }

  return result;
}

function isValidPassword(password: string): boolean {
  const hasLowerCount = (password.match(/[a-z]/g) || []).length >= 2;
  const hasUpperCount = (password.match(/[A-Z]/g) || []).length >= 2;
  const hasDigitCount = (password.match(/[0-9]/g) || []).length >= 2;
  const hasSpecialCount = (password.match(/[!@#$%^&*]/g) || []).length >= 1;

  return hasLowerCount && hasUpperCount && hasDigitCount && hasSpecialCount;
}
