import { koboFromNaira, type Kobo } from './kobo';

/**
 * Parse a user-entered Nigerian Naira string into Kobo.
 * Accepts: "833,333", "₦833,333", "₦ 833,333.50", "-1,000", "0", "₦0.00".
 * Rejects: empty/whitespace-only, non-numeric, multiple separators,
 * and sub-kobo precision (more than 2 decimal places).
 */
export function parseNgn(input: string): Kobo {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('parseNgn: empty input');
  }

  const stripped = trimmed.replace(/₦/g, '').trim();

  let negative = false;
  let body = stripped;
  if (body.startsWith('-')) {
    negative = true;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) {
    body = body.slice(1).trim();
  }

  // Split integer and decimal parts before stripping commas so we can
  // validate grouping ("1,2,3,4" is invalid even though stripping yields digits).
  const parts = body.split('.');
  if (parts.length > 2) {
    throw new Error(`parseNgn: invalid amount "${input}"`);
  }
  const [intPart = '', decimals = ''] = parts;

  const intIsGrouped = intPart.includes(',')
    ? /^\d{1,3}(,\d{3})+$/.test(intPart)
    : /^\d+$/.test(intPart);
  const decimalsValid = parts.length === 1 || /^\d+$/.test(decimals);
  if (!intIsGrouped || !decimalsValid) {
    throw new Error(`parseNgn: invalid amount "${input}"`);
  }
  if (decimals.length > 2) {
    throw new Error(`parseNgn: sub-kobo precision not allowed in "${input}"`);
  }

  const noCommas = intPart.replace(/,/g, '') + (decimals ? `.${decimals}` : '');
  const naira = Number(noCommas);
  const kobo = koboFromNaira(naira);
  return (negative ? -kobo : kobo) as Kobo;
}
