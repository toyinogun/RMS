import type { Kobo } from './types.js';

export type { Kobo } from './types.js';

/**
 * Convert a naira amount (possibly fractional) to kobo.
 * Uses banker's rounding (half-even) on sub-kobo fractions.
 *
 * IEEE-754 note: 0.005 * 100 = 0.5 exactly in JS. Math.round(0.5) === 1
 * (round half away from zero), so evenRound must intercept the exact-half
 * case and route to the nearest even integer instead.
 */
export function koboFromNaira(naira: number): Kobo {
  if (Object.is(naira, -0)) return 0n as Kobo;
  const scaled = naira * 100;
  return BigInt(evenRound(scaled)) as Kobo;
}

/**
 * Banker's rounding (half-even / round half to even).
 * Falls back to Math.round for non-half values.
 */
function evenRound(n: number): number {
  const rounded = Math.round(n);
  if (Math.abs(n - Math.trunc(n)) === 0.5) {
    // Exact halfway: pick the nearest even integer.
    return rounded % 2 === 0 ? rounded : rounded - Math.sign(n);
  }
  return rounded;
}

/** Lossy convert back to a Number for display only. Do not use for math. */
export function koboToNaira(kobo: Kobo): number {
  return Number(kobo) / 100;
}

/**
 * Formats kobo as a Nigerian Naira string.
 * Constructs the string manually to avoid Intl double-decimal issues:
 * the integer naira part uses a grouping formatter (no fractions),
 * then the kobo remainder is appended after a literal ".".
 */
const NAIRA_INT_FORMATTER = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatKobo(kobo: Kobo): string {
  const negative = kobo < 0n;
  const absolute = negative ? -kobo : kobo;
  const naira = absolute / 100n;
  const remainder = absolute % 100n;
  const nairaPart = NAIRA_INT_FORMATTER.format(Number(naira));
  const koboPart = remainder.toString().padStart(2, '0');
  return `${negative ? '-' : ''}₦${nairaPart}.${koboPart}`;
}

export function sumKobo(values: Kobo[]): Kobo {
  let total = 0n;
  for (const v of values) total += v;
  return total as Kobo;
}
