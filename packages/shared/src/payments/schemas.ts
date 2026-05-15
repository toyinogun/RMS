import { z } from 'zod';
import { parseNgn } from '../money/parse';

const PAID_AT_GRACE_DAYS = 1;
const REFERENCE_MAX = 100;
const NOTES_MAX = 500;

const ngnAmount = (label: string) =>
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

const paidAtSchema = z
  .string()
  .trim()
  .min(1, 'Payment date is required')
  .transform((raw, ctx) => {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Invalid payment date' });
      return z.NEVER;
    }
    const graceMs = PAID_AT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (d.getTime() > Date.now() + graceMs) {
      ctx.addIssue({ code: 'custom', message: 'Payment date cannot be in the future' });
      return z.NEVER;
    }
    return d;
  });

const optionalTrimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length <= max, {
      message: `${label} must be ${max} characters or fewer`,
    });

const allocationRowSchema = z
  .object({
    installmentId: z.string().uuid({ message: 'Invalid installment id' }),
    amountNgn: ngnAmount('Amount'),
  })
  .transform(({ installmentId, amountNgn }) => ({
    installmentId,
    amountKobo: amountNgn,
  }));

const paymentCoreFields = z.object({
  planId: z.string().uuid({ message: 'Invalid plan id' }),
  amountNgn: ngnAmount('Amount'),
  paidAt: paidAtSchema,
  method: z.enum(['CASH', 'TRANSFER', 'CHEQUE', 'CARD_MANUAL', 'OTHER']),
  reference: optionalTrimmed('Reference', REFERENCE_MAX),
  notes: optionalTrimmed('Notes', NOTES_MAX),
  allocations: z.array(allocationRowSchema).optional(),
});

export const paymentRecordSchema = paymentCoreFields
  .transform(({ amountNgn, ...rest }) => ({
    ...rest,
    amountKobo: amountNgn,
  }))
  .superRefine((val, ctx) => {
    if (val.amountKobo <= 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountNgn'],
        message: 'Amount must be greater than zero',
      });
    }
    if (val.allocations !== undefined) {
      if (val.allocations.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations'],
          message: 'Allocations must be omitted or non-empty',
        });
        return;
      }
      let sum = 0n;
      for (let i = 0; i < val.allocations.length; i++) {
        const row = val.allocations[i]!;
        if (row.amountKobo <= 0n) {
          ctx.addIssue({
            code: 'custom',
            path: ['allocations', i, 'amountNgn'],
            message: 'Amount must be greater than zero',
          });
        }
        sum += row.amountKobo;
      }
      if (sum !== val.amountKobo) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations'],
          message: 'Allocation amounts must sum to the payment amount',
        });
      }
    }
  });

export type PaymentRecordInput = z.infer<typeof paymentRecordSchema>;
