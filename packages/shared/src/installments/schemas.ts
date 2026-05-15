import { z } from 'zod';
import { ngnAmount } from '../money/zod';
import { optionalTrimmed, paymentMethodSchema } from '../payments/schemas';

const MIN_TERM = 6;
const MAX_TERM = 36;
const DATE_GRACE_DAYS = 1;
const DEPOSIT_REFERENCE_MAX = 100;
const DEPOSIT_NOTES_MAX = 500;

const pastTolerantDateSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((raw, ctx) => {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: `Invalid ${label.toLowerCase()}` });
        return z.NEVER;
      }
      const graceMs = DATE_GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (d.getTime() < Date.now() - graceMs) {
        ctx.addIssue({ code: 'custom', message: `${label} cannot be in the past` });
        return z.NEVER;
      }
      return d;
    });

const startDateSchema = pastTolerantDateSchema('Start date');
const depositPaidAtSchema = pastTolerantDateSchema('Deposit paid date');

const customerExistingSchema = z.object({
  mode: z.literal('existing'),
  id: z.string().uuid(),
});

const customerNewSchema = z.object({
  mode: z.literal('new'),
  fullName: z.string().trim().min(1, 'Required').max(200),
  phone: z.string().trim().min(7, 'Phone must be at least 7 characters').max(40),
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Invalid email',
    }),
  nationalId: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length <= 60, { message: 'Must be 60 characters or fewer' }),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length <= 1000, {
      message: 'Must be 1000 characters or fewer',
    }),
});

const customerSchema = z.discriminatedUnion('mode', [customerExistingSchema, customerNewSchema]);

const planCoreFields = z.object({
  customer: customerSchema,
  propertyId: z.string().uuid({ message: 'Select a property' }),
  totalPriceNgn: ngnAmount('Total price'),
  depositNgn: ngnAmount('Deposit'),
  monthlyNgn: ngnAmount('Monthly amount'),
  termMonths: z.coerce
    .number()
    .int('Term must be a whole number of months')
    .min(MIN_TERM, `Term must be at least ${MIN_TERM} months`)
    .max(MAX_TERM, `Term cannot exceed ${MAX_TERM} months`),
  startDate: startDateSchema,
  depositReceived: z.boolean().default(false),
  // M4 deposit-at-creation subfields — only consumed when depositReceived === true.
  depositMethod: paymentMethodSchema.optional(),
  depositPaidAt: depositPaidAtSchema.optional(),
  depositReference: optionalTrimmed('Reference', DEPOSIT_REFERENCE_MAX),
  depositNotes: optionalTrimmed('Notes', DEPOSIT_NOTES_MAX),
});

export const planCreateSchema = planCoreFields
  .transform(({ totalPriceNgn, depositNgn, monthlyNgn, ...rest }) => ({
    ...rest,
    totalPriceKobo: totalPriceNgn,
    depositKobo: depositNgn,
    monthlyKobo: monthlyNgn,
  }))
  .superRefine((val, ctx) => {
    if (val.totalPriceKobo <= 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalPriceNgn'],
        message: 'Total price must be greater than zero',
      });
    }
    if (val.depositKobo < 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['depositNgn'],
        message: 'Deposit cannot be negative',
      });
    }
    if (val.monthlyKobo <= 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['monthlyNgn'],
        message: 'Monthly amount must be greater than zero',
      });
    }
    if (val.depositKobo > val.totalPriceKobo) {
      ctx.addIssue({
        code: 'custom',
        path: ['depositNgn'],
        message: 'Deposit cannot exceed total price',
      });
    }
    const reach = val.depositKobo + val.monthlyKobo * BigInt(val.termMonths);
    if (reach < val.totalPriceKobo) {
      ctx.addIssue({
        code: 'custom',
        path: ['monthlyNgn'],
        message: 'Deposit plus monthly × term is less than the total price',
      });
    }
    if (val.depositReceived) {
      if (val.depositKobo === 0n) {
        ctx.addIssue({
          code: 'custom',
          path: ['depositNgn'],
          message: 'Deposit amount is required when deposit is being recorded',
        });
      }
      if (val.depositMethod === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['depositMethod'],
          message: 'Payment method is required when recording a deposit',
        });
      }
    }
  })
  .transform((val) => {
    if (val.depositReceived && val.depositPaidAt === undefined) {
      return { ...val, depositPaidAt: val.startDate };
    }
    return val;
  });
export type PlanCreateInput = z.infer<typeof planCreateSchema>;

export const planCancelSchema = z.object({ id: z.string().uuid() });
export type PlanCancelInput = z.infer<typeof planCancelSchema>;

const planStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED']);

export const planListFilterSchema = z.object({
  status: z
    .union([planStatusSchema, z.literal('ALL')])
    .optional()
    .transform((v) => (v === undefined ? 'ALL' : v)),
  q: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});
export type PlanListFilterInput = z.infer<typeof planListFilterSchema>;
export type PlanStatusFilter = z.infer<typeof planStatusSchema> | 'ALL';
