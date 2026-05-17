/**
 * Atrium is the single Phase 1a tenant; their operations are in Lagos.
 * When Phase 2 introduces multi-tenant, replace this with `Tenant.timezone`
 * sourced from `TenantContext`.
 */
export const TENANT_TIMEZONE = 'Africa/Lagos' as const;

export type DayRange = Readonly<{ startUtc: Date; endUtc: Date }>;

/**
 * Returns the [startUtc, endUtc) window for "today" expressed in `tz`.
 * Use the returned bounds in Prisma `where: { paidAt: { gte: startUtc, lt: endUtc } }`.
 */
export function tenantDayRange(now: Date, tz: string = TENANT_TIMEZONE): DayRange {
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
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl part missing: ${type}`);
    return part.value;
  };

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const offsetRaw = get('timeZoneName'); // e.g. "GMT+01:00" or "GMT"
  const offset = offsetRaw === 'GMT' ? '+00:00' : offsetRaw.replace('GMT', '');

  const startUtc = new Date(`${year}-${month}-${day}T00:00:00${offset}`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}
