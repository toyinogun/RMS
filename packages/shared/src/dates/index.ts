/**
 * Atrium is the single Phase 1a tenant; their operations are in Lagos.
 * When Phase 2 introduces multi-tenant, replace this with `Tenant.timezone`
 * sourced from `TenantContext`.
 */
export const TENANT_TIMEZONE = 'Africa/Lagos' as const;

export type DayRange = Readonly<{ startUtc: Date; endUtc: Date }>;

/**
 * Returns the tz offset (in minutes east of UTC) at the given UTC instant.
 * E.g. for Africa/Lagos this is always +60. For Europe/London it is 0 in
 * winter and +60 during BST.
 */
function tzOffsetMinutes(instantUtcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(instantUtcMs));

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl part missing: ${type}`);
    return part.value;
  };

  const offsetRaw = get('timeZoneName');
  // 'longOffset' always produces "GMT±HH:MM" on modern ICU; "GMT" alone is the
  // UTC case. Anything else means the runtime returned a format we don't yet
  // handle — fail loudly so we don't silently miscompute the window.
  const match = /^GMT([+-])(\d{2}):(\d{2})$|^GMT$/.exec(offsetRaw);
  if (!match) throw new Error(`Unexpected Intl timeZoneName format: ${offsetRaw}`);
  if (match[0] === 'GMT') return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const mins = Number(match[3]);
  return sign * (hours * 60 + mins);
}

/**
 * Returns the UTC instant corresponding to local midnight of the local calendar
 * day that contains `t` in `tz`. Correct across DST transitions because the
 * offset is resolved at the *resulting* instant, not at `t`.
 */
function localMidnightUtc(t: Date, tz: string): Date {
  // 1) Find the local calendar date (y/m/d) of `t` in `tz`.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(t);

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl part missing: ${type}`);
    return part.value;
  };

  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));

  // 2) UTC instant of "Y-M-D 00:00:00 UTC" as a starting reference.
  const utcMidnightMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);

  // 3) Resolve the tz offset *at the local-midnight instant we're after*.
  //    First-pass guess uses the offset at utcMidnightMs itself; we then
  //    re-check at the candidate to handle DST transitions that land near
  //    midnight (e.g. countries where DST flips at 00:00 local).
  const guessOffsetMin = tzOffsetMinutes(utcMidnightMs, tz);
  const candidateMs = utcMidnightMs - guessOffsetMin * 60_000;
  const candidateOffsetMin = tzOffsetMinutes(candidateMs, tz);
  const localMidnightMs = utcMidnightMs - candidateOffsetMin * 60_000;

  return new Date(localMidnightMs);
}

/**
 * Returns the [startUtc, endUtc) window for "today" expressed in `tz`.
 * Use the returned bounds in Prisma `where: { paidAt: { gte: startUtc, lt: endUtc } }`.
 *
 * `endUtc` is the *next* local midnight (not `startUtc + 24h`), so the window
 * stays correct on DST-transition days for zones that observe DST.
 */
export function tenantDayRange(now: Date, tz: string = TENANT_TIMEZONE): DayRange {
  const startUtc = localMidnightUtc(now, tz);
  // Pin the "next day" probe to startUtc + 25h. Starting from startUtc (not now)
  // guarantees we land in the next local day regardless of where `now` sat
  // inside the current local day. +25h covers the largest real-world DST jump.
  const endUtc = localMidnightUtc(new Date(startUtc.getTime() + 25 * 60 * 60 * 1000), tz);
  return { startUtc, endUtc };
}
