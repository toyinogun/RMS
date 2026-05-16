import { z } from 'zod';
import { ngnAmount } from '../money/zod';

const PAID_AT_GRACE_DAYS = 1;
const REFERENCE_MAX = 100;
const NOTES_MAX = 500;

export const paymentMethodSchema = z.enum(['CASH', 'TRANSFER', 'CHEQUE', 'CARD_MANUAL', 'OTHER']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paidAtSchema = z
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

export const optionalTrimmed = (label: string, max: number) =>
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
  method: paymentMethodSchema,
  reference: optionalTrimmed('Reference', REFERENCE_MAX),
  notes: optionalTrimmed('Notes', NOTES_MAX),
  allocations: z.array(allocationRowSchema).optional(),
});

/**
 * Input schema for the record-payment server action. Transforms NGN strings to Kobo (renaming
 * amountNgn → amountKobo at both top level and per allocation row). When allocations is provided,
 * the sum of row amountKobo must equal the top-level amountKobo.
 */
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

const REASON_MAX = 500;

/**
 * Input schema for the reverse-payment server action.
 *
 * - `paymentId`: the UUID of the original payment being reversed.
 * - `reason`: optional free-text explanation (max 500 chars). Whitespace-only strings are
 *   normalised to `undefined`. When present, the reversal service will prefix it as
 *   `[Reversal] ${reason}`; when absent the notes field becomes `[Reversal]`.
 */
export const paymentReversalSchema = z.object({
  paymentId: z.string().uuid({ message: 'Invalid payment id' }),
  reason: optionalTrimmed('Reason', REASON_MAX),
});

export type PaymentReversalInput = z.infer<typeof paymentReversalSchema>;
