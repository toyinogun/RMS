import { z } from 'zod';
import { parseNgn } from '../money/parse';

const codeRegex = /^[A-Z0-9][A-Z0-9-]{0,31}$/;

const ngnAmountSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .transform((raw, ctx) => {
    try {
      const kobo = parseNgn(raw);
      if (kobo <= 0n) {
        ctx.addIssue({ code: 'custom', message: 'Must be greater than zero' });
        return z.NEVER;
      }
      return kobo;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid amount' });
      return z.NEVER;
    }
  });

const propertyCoreFields = {
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(codeRegex, 'Use letters, digits, and dashes only')),
  title: z.string().trim().min(1).max(200),
  addressLine: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
} as const;

export const propertyCreateSchema = z
  .object({
    ...propertyCoreFields,
    totalPriceNgn: ngnAmountSchema,
  })
  .transform(({ totalPriceNgn, ...rest }) => ({
    ...rest,
    totalPriceKobo: totalPriceNgn,
  }));
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

export const propertyUpdateSchema = z
  .object({
    id: z.string().uuid(),
    ...propertyCoreFields,
    totalPriceNgn: ngnAmountSchema,
  })
  .transform(({ totalPriceNgn, ...rest }) => ({
    ...rest,
    totalPriceKobo: totalPriceNgn,
  }));
export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

// M2 cannot manually transition to SOLD — that's M3's auto-flip.
export const propertyStatusSchema = z.enum(['AVAILABLE', 'RESERVED']);
export type PropertyStatusInput = z.infer<typeof propertyStatusSchema>;

export const propertySetStatusSchema = z.object({
  id: z.string().uuid(),
  status: propertyStatusSchema,
});
export type PropertySetStatusInput = z.infer<typeof propertySetStatusSchema>;

export const propertyIdSchema = z.object({ id: z.string().uuid() });
export type PropertyIdInput = z.infer<typeof propertyIdSchema>;
