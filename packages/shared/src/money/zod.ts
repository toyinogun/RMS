import { z } from 'zod';
import { parseNgn } from './parse';

/**
 * Factory for a Zod schema that accepts a user-entered NGN string and transforms
 * it into a bigint count of Kobo. The provided `label` is used in error messages
 * for the empty/invalid cases (e.g. "Amount is required", "Invalid amount").
 */
export const ngnAmount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((raw, ctx) => {
      try {
        return parseNgn(raw);
      } catch {
        ctx.addIssue({ code: 'custom', message: `Invalid ${label.toLowerCase()}` });
        return z.NEVER;
      }
    });
