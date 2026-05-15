import { z } from 'zod';

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'Invalid email',
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length <= max, {
      message: `Must be ${max} characters or fewer`,
    });

export const customerCreateSchema = z.object({
  fullName: z.string().trim().min(1, 'Required').max(200),
  phone: z.string().trim().min(7, 'Phone must be at least 7 characters').max(40),
  email: optionalEmail,
  nationalId: optionalText(60),
  notes: optionalText(1000),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = customerCreateSchema.extend({
  id: z.string().uuid(),
});
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerIdSchema = z.object({ id: z.string().uuid() });
export type CustomerIdInput = z.infer<typeof customerIdSchema>;
