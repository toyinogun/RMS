/**
 * Branded BigInt for Nigerian Naira minor units.
 * 1 NGN = 100 kobo. Negative values are valid (reversal rows).
 */
export type Kobo = bigint & { readonly __brand: 'Kobo' };
