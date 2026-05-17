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
  // Reject bytes >= LIMIT to eliminate modulo bias.
  // With a 60-char alphabet, 256 % 60 = 16, causing positions 0–15 to be
  // selected 25% more often than 16–59 if we naively use modulo.
  // LIMIT = 240 = largest multiple of 60 not exceeding 256.
  const LIMIT = 256 - (256 % ALL_CHARS.length);

  const bytes = randomBytes(16);
  let result = '';
  let byteIndex = 0;

  while (result.length < 16) {
    if (byteIndex >= bytes.length) {
      // Refill buffer if exhausted
      const newBytes = randomBytes(16);
      for (let i = 0; i < newBytes.length; i++) {
        bytes[i] = newBytes[i] as number;
      }
      byteIndex = 0;
    }

    const byte = bytes[byteIndex] as number;
    byteIndex++;

    // Skip bytes >= LIMIT to avoid bias
    if (byte >= LIMIT) {
      continue;
    }

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
