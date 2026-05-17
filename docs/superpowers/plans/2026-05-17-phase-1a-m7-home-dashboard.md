# Phase 1a · M7 — Home Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M7 from the Phase 1a design spec — replace the home page welcome text with three live stat cards (today's net payments total, overdue installments count, active plans count) and a recent-activity table (last 10 Payment rows, with reversals as their own negative-amount rows). This closes Phase 1a alongside the existing closeout E2E.

**Architecture:** All dashboard data is fetched server-side in the `app/(authenticated)/page.tsx` RSC via a new `dashboard-service.ts` in `@solutio/db` that owns three pure read queries — `getDashboardStats(ctx)` and `listRecentActivity(ctx, limit)` — both routed through the `forTenant` tenant-scoped client. A new tiny `@solutio/shared/dates` module exposes `tenantDayRange(now, tz)` so the "today" window is computed once, in tenant-local time (`Africa/Lagos`), and shared by tests + service. Card + table are presentational server components; no client JS unless an interaction is added later.

**Tech Stack:** Next.js 16 RSC (no client components added) · Prisma 7 (`forTenant` extension, `aggregate` + `count` + `findMany`) · Vitest (pure unit for date helper, testcontainers/postgres for service) · Playwright (extend the existing closeout E2E lane — no new e2e file) · shadcn/ui (`Card`, `Table`, `Badge` — already installed).

**Spec sections this plan implements:** `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §M7 (lines 273–280) plus the Phase 1a closeout cross-cutting acceptance §282–289.

**Decisions resolved up front (would otherwise block):**

1. **Tenant timezone for "today":** Atrium is Nigerian (Phase 0 anchor `project_solutio_phase0_anchors`), so the dashboard computes "today" in `Africa/Lagos`. The timezone is a constant in `@solutio/shared/dates` for now — when multi-tenant lands (Phase 2), this becomes a `Tenant.timezone` column. Documented in code comment on `tenantDayRange`.
2. **"Payment detail" link target:** There is no `/payments/[id]` page in Phase 1a — Payments live inside `/plans/[id]` Payments tab. Recent-activity rows link to `/plans/[planId]?tab=payments#payment-{id}`. The Payments tab already renders all rows; the anchor is best-effort scroll. Documented in code comment on `<RecentActivityTable />`.
3. **Welcome text + the M3 nav cards:** Spec says "replace welcome text with…". The three existing nav cards (Customers / Properties / Plans) are kept below the stats + activity as a "Quick links" row — the site nav already covers navigation, but removing the cards alongside the welcome text leaves the page sparse for a STAFF user with no recent activity. (If, on review, this feels redundant with the site nav, drop the cards — this is a small RSC tweak, no schema or service impact.)
4. **Overdue counted at the installment level, not plan level:** Per spec — "Overdue = installment with `status != PAID` and `dueDate < now()`". So three installments overdue on one plan counts as 3, not 1.
5. **Today's payments total is the net for the day:** Spec is explicit — reversals count as negative. So `SUM(amountKobo)` over Payment rows whose `paidAt` falls in the local-day window — no filter on `reversedById`, because both the original Payment and the reversal Payment row have a `paidAt`. (The reversal row's `amountKobo` is already stored negative — verified in `payments-service.ts:627`.)
6. **Active plans count uses `Plan.status = 'ACTIVE'`:** does not include DRAFT, COMPLETED, DEFAULTED, or CANCELLED. Soft-deleted excluded.

**Out of scope for M7 (locked):**
- A dedicated `/payments/[id]` detail page — defer until a user-research signal asks for it
- Date-range pickers, charts, drill-downs — Phase 2 dashboard work
- Tenant-configurable timezone — Phase 2 multi-tenant work
- Realtime updates (websocket / poll) — `revalidatePath('/')` from existing payment/plan actions already invalidates the RSC; no new mechanism

---

## File map

**Create:**
- `packages/shared/src/dates/index.ts` — `TENANT_TIMEZONE` const + `tenantDayRange(now, tz)` returning `{ startUtc: Date, endUtc: Date }`
- `packages/shared/src/dates/__tests__/range.test.ts`
- `packages/db/src/dashboard-service.ts` — `getDashboardStats`, `listRecentActivity`, exported result types
- `packages/db/__tests__/dashboard-service.integration.test.ts`
- `apps/web/components/dashboard/stat-card.tsx` (server component)
- `apps/web/components/dashboard/recent-activity-table.tsx` (server component)
- `apps/web/components/dashboard/__tests__/recent-activity-table.test.tsx`

**Modify:**
- `packages/shared/src/index.ts` — re-export `@solutio/shared/dates` barrel (optional; subpath import is fine)
- `packages/db/src/index.ts` — re-export `getDashboardStats`, `listRecentActivity`, their result types
- `apps/web/app/(authenticated)/page.tsx` — replace welcome text + nav-cards section with `<StatCards />` + `<RecentActivityTable />`; keep the three Quick Links cards below per decision #3
- `apps/web/e2e/closeout.e2e.ts` (if it exists) **or** the M4–M5 e2e file that covers the record/reverse flow — append assertions that the dashboard reflects net state after a record + reverse cycle. If no closeout file exists yet, extend `apps/web/e2e/m5-payment-reversal.e2e.ts` (or equivalent) with the final assertion block — do **not** create a new e2e lane just for M7 stats; the spec's closeout E2E (§286) is the single Phase-1a journey.

**Touch only if a step requires it (do NOT modify pre-emptively):**
- `packages/db/prisma/schema.prisma` — M7 ships **zero schema changes**. If a step appears to require one, stop and escalate.

---

## Cross-cutting conventions (read before starting Task 1)

These are the established conventions from M1–M6. Re-stated so the implementer doesn't have to re-derive them.

1. **No `.js` suffix in `packages/{shared,db}/src/**`.** Project uses Bundler moduleResolution; Turbopack rejects `.js → .ts` mapping. Test files keep the suffix. Per memory `feedback_no_js_suffix_in_shared_src`.
2. **`apps/web` imports `@solutio/db` via submodule paths only** — `@solutio/db/dashboard-service`. Never the barrel. Per memory `feedback_apps_web_imports_db_via_submodules`.
3. **Service functions own `prisma` internally** and take `(ctx, input)`. They never take `prisma` as a parameter, and `apps/web` pages must never import `@solutio/db/client`. Per memory `feedback_service_functions_own_prisma_internally`.
4. **Service-layer functions take explicit `TenantContext` as first param**, never call ambient `getTenantContext()`. Per memory `feedback_service_layer_explicit_ctx_param`.
5. **Soft-delete pattern:** every list/aggregate query filters `where: { deletedAt: null }` for `Plan`. (Payment has no `deletedAt`. Installment has none either — verified in schema.)
6. **Auth gate:** `app/(authenticated)/layout.tsx` already enforces auth; the home page must still call `await getTenantContext()` and `redirect('/login')` if null (defense-in-depth, matches M3 pattern).
7. **No role gate on dashboard:** every signed-in role (OWNER / ADMIN / STAFF) sees the same stats. The page does **not** call `hasRole`.
8. **Money formatting:** `formatKobo` from `@solutio/shared/money` already handles negatives (verified by `packages/shared/src/money/__tests__/kobo.test.ts:34` — `-₦250,000.50`). Use it directly for the today-total card and the activity-row amount column.
9. **Date formatting in activity table:** use `Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })`. No new dep.
10. **Subagents must verify branch + use explicit `git add <files>`** for every commit, per memory `feedback_subagents_must_verify_branch_before_committing`. Each commit step below lists exact files — copy them verbatim.

---

## Task 1 — `tenantDayRange` helper in `@solutio/shared/dates`

**Files:**
- Create: `packages/shared/src/dates/index.ts`
- Create: `packages/shared/src/dates/__tests__/range.test.ts`

**What it does:**

Returns the `[startUtc, endUtc)` window for "today" expressed in a given IANA timezone. Tenant timezone is `Africa/Lagos` (UTC+1, no DST). The helper takes `now: Date` (injected for testability) and `tz: string` (defaulting to `TENANT_TIMEZONE`).

The implementation strategy: use `Intl.DateTimeFormat` with `timeZone: tz` to extract `{ year, month, day }` of `now` in the target tz, then construct the local-midnight string `YYYY-MM-DDT00:00:00` and parse it back with the tz offset. For `Africa/Lagos` (fixed +01:00, no DST) we can hard-code the offset. To stay safe against a future DST-bearing tz, derive the offset by formatting `now` with `timeZoneName: 'longOffset'` and parsing the `GMT±HH:MM` suffix.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/dates/__tests__/range.test.ts
import { describe, expect, test } from 'vitest';
import { TENANT_TIMEZONE, tenantDayRange } from '../index.ts';

describe('tenantDayRange', () => {
  test('TENANT_TIMEZONE is Africa/Lagos', () => {
    expect(TENANT_TIMEZONE).toBe('Africa/Lagos');
  });

  test('returns the local-midnight UTC window for an afternoon "now"', () => {
    // 2026-05-17 14:30 in Africa/Lagos == 2026-05-17 13:30 UTC
    const now = new Date('2026-05-17T13:30:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    // Lagos midnight on 2026-05-17 == 2026-05-16T23:00:00Z
    expect(startUtc.toISOString()).toBe('2026-05-16T23:00:00.000Z');
    // Next Lagos midnight == 2026-05-17T23:00:00Z
    expect(endUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
  });

  test('handles a "now" that is already past local midnight in UTC but the same Lagos day', () => {
    // 2026-05-18 00:30 UTC == 2026-05-18 01:30 Lagos → still the 18th in Lagos
    const now = new Date('2026-05-18T00:30:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    expect(startUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-18T23:00:00.000Z');
  });

  test('handles a "now" right before local midnight', () => {
    // 2026-05-17 22:59 UTC == 2026-05-17 23:59 Lagos → still the 17th in Lagos
    const now = new Date('2026-05-17T22:59:00.000Z');
    const { startUtc, endUtc } = tenantDayRange(now);
    expect(startUtc.toISOString()).toBe('2026-05-16T23:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-05-17T23:00:00.000Z');
  });

  test('window is exactly 24 hours wide', () => {
    const { startUtc, endUtc } = tenantDayRange(new Date('2026-05-17T13:30:00.000Z'));
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @solutio/shared test dates`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/dates/index.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @solutio/shared test dates`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dates/index.ts packages/shared/src/dates/__tests__/range.test.ts
git commit -m "feat(shared): add tenantDayRange helper for tenant-local 'today' windows"
```

**Acceptance:**
- [ ] `pnpm -F @solutio/shared test dates` passes
- [ ] Coverage on `dates/index.ts` = 100% (it's tiny)

---

## Task 2 — `dashboard-service.ts` in `@solutio/db`

**Files:**
- Create: `packages/db/src/dashboard-service.ts`
- Modify: `packages/db/src/index.ts` — re-export functions + result types

**Functions:**

### `getDashboardStats(ctx: TenantContext, now?: Date): Promise<DashboardStats>`

Single round-trip via `$transaction([aggregate, count, count])`. `now` defaults to `new Date()` and is injected by tests.

```ts
// pseudocode of the body
const { startUtc, endUtc } = tenantDayRange(now ?? new Date());
const scoped = forTenant(prisma, ctx.tenantId);

const [paymentAgg, overdueCount, activePlanCount] = await scoped.$transaction([
  scoped.payment.aggregate({
    where: { paidAt: { gte: startUtc, lt: endUtc } },
    _sum: { amountKobo: true },
  }),
  scoped.installment.count({
    where: {
      status: { not: 'PAID' },
      dueDate: { lt: now ?? new Date() },
      plan: { deletedAt: null }, // exclude installments on soft-deleted plans
    },
  }),
  scoped.plan.count({
    where: { status: 'ACTIVE', deletedAt: null },
  }),
]);

return {
  todayNetTotalKobo: (paymentAgg._sum.amountKobo ?? 0n) as Kobo, // BigInt; may be negative if net-negative day
  overdueInstallmentCount: overdueCount,
  activePlanCount,
};
```

### `listRecentActivity(ctx: TenantContext, limit = 10): Promise<RecentActivityRow[]>`

```ts
const scoped = forTenant(prisma, ctx.tenantId);

const payments = await scoped.payment.findMany({
  orderBy: { paidAt: 'desc' },
  take: limit,
  select: {
    id: true,
    planId: true,
    amountKobo: true,
    paidAt: true,
    method: true,
    reversedById: true,
    plan: { select: { customer: { select: { fullName: true } }, property: { select: { code: true } } } },
  },
});

return payments.map((p) => ({
  id: p.id,
  planId: p.planId,
  amountKobo: p.amountKobo as Kobo, // negative when this row is itself a reversal
  paidAt: p.paidAt,
  method: p.method,
  isReversal: p.reversedById !== null,
  customerName: p.plan.customer.fullName,
  propertyCode: p.plan.property.code,
}));
```

**Result types (exported):**

```ts
export type DashboardStats = Readonly<{
  todayNetTotalKobo: Kobo;
  overdueInstallmentCount: number;
  activePlanCount: number;
}>;

export type RecentActivityRow = Readonly<{
  id: string;
  planId: string;
  amountKobo: Kobo;
  paidAt: Date;
  method: PaymentMethod;
  isReversal: boolean;
  customerName: string;
  propertyCode: string;
}>;
```

**No new error classes** — these are read-only queries; a missing tenant context is impossible (caller already asserted it).

### Integration tests (`packages/db/__tests__/dashboard-service.integration.test.ts`)

The repo's existing test infra is `startPostgres()` from `_helpers/postgres.js` + per-test inline seeding via the real service functions. There is **no** `resetDatabase` / `seedFixtureTenant` helper — each test file owns its tenant ids, seeds via `createCustomer` / `createProperty` / `createPlan` / `recordPayment` / `reversePayment`, and uses raw `prisma` (`pg.prisma`) for status transitions the public service doesn't expose (e.g., flipping `Plan.status` to ACTIVE, soft-deleting). Copy the `ctxFor` / `seedAvailableProperty` / `seedCustomer` / `baseCreateInput` patterns from `payments-service.integration.test.ts:30-90`.

> **Note on `.js` import suffix in tests:** test files import service modules as `'../src/dashboard-service.js'` (with `.js`) even though sources do not. Per cross-cutting convention #1 + `feedback_no_js_suffix_in_shared_src`. Verified against `payments-service.integration.test.ts:18`.

- [ ] **Step 1: Write the failing test file**

```ts
// packages/db/__tests__/dashboard-service.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { getDashboardStats, listRecentActivity } from '../src/dashboard-service.js';
import { createPlan } from '../src/plans-service.js';
import { recordPayment, reversePayment } from '../src/payments-service.js';
import { createCustomer } from '../src/customers-service.js';
import { createProperty } from '../src/properties-service.js';
import type { TenantContext } from '@solutio/shared/tenant';
import type { Kobo } from '@solutio/shared/money';

let pg: TestPostgres;

const TENANT_A = '01935b7e-0007-7000-8000-000000000001';
const TENANT_B = '01935b7e-0007-7000-8000-000000000002';
const USER_A = '01935b7e-0007-7000-8000-aaaaaaaaaaaa';
const USER_B = '01935b7e-0007-7000-8000-bbbbbbbbbbbb';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: tenantId === TENANT_A ? USER_A : USER_B,
    authUserId: tenantId === TENANT_A ? USER_A : USER_B,
    role: 'OWNER',
    email: `owner@${tenantId === TENANT_A ? 'a' : 'b'}-dash`,
    mustChangePassword: false,
  },
});

let codeSeq = 0;
const nextCode = (prefix = 'DASH') => `${prefix}-${(++codeSeq).toString().padStart(5, '0')}`;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg.stop();
});

// Wipe between tests so counts are deterministic.
// Order matters: child tables first. PaymentAllocation → Payment → Installment → Plan → Property → Customer → User → Tenant.
beforeEach(async () => {
  await pg.prisma.$executeRawUnsafe('TRUNCATE TABLE "PaymentAllocation","Payment","Installment","Plan","Property","Customer","User","Tenant" RESTART IDENTITY CASCADE');
  // Re-seed the two tenants + owner users used by ctxFor
  for (const [tenantId, userId, email] of [
    [TENANT_A, USER_A, 'owner@a-dash'],
    [TENANT_B, USER_B, 'owner@b-dash'],
  ] as const) {
    await pg.prisma.tenant.create({ data: { id: tenantId, name: `Dash ${tenantId.slice(-4)}` } });
    await pg.prisma.user.create({
      data: { id: userId, tenantId, authUserId: userId, email, name: 'Owner', role: 'OWNER', status: 'ACTIVE' },
    });
  }
});

/** Create an ACTIVE plan with `installmentCount` PENDING installments (one due date per month from `startDate`). */
async function seedActivePlan(opts: {
  ctx: TenantContext;
  startDate: Date;
  installmentCount: number;
  monthlyKobo: bigint;
}): Promise<{ planId: string }> {
  const customer = await createCustomer(opts.ctx, { fullName: 'Buyer', phone: `+23480${Date.now() % 100000000}` });
  const property = await createProperty(opts.ctx, {
    code: nextCode(),
    title: 'Unit',
    addressLine: '1 Test St',
    city: 'Lagos',
    totalPriceKobo: (opts.monthlyKobo * BigInt(opts.installmentCount)) as Kobo,
  });
  const plan = await createPlan(opts.ctx, {
    customer: { mode: 'existing', id: customer.id },
    propertyId: property.id,
    totalPriceKobo: (opts.monthlyKobo * BigInt(opts.installmentCount)) as Kobo,
    depositKobo: 0n as Kobo,
    monthlyKobo: opts.monthlyKobo as Kobo,
    termMonths: opts.installmentCount,
    startDate: opts.startDate,
    depositReceived: false,
  });
  // Flip DRAFT → ACTIVE via raw prisma (createPlan only produces DRAFT in M3).
  await pg.prisma.plan.update({ where: { id: plan.id }, data: { status: 'ACTIVE' } });
  return { planId: plan.id };
}

describe('dashboard-service', () => {
  describe('getDashboardStats', () => {
    test('zero state on a clean tenant', async () => {
      const stats = await getDashboardStats(ctxFor(TENANT_A), new Date('2026-05-17T13:30:00Z'));
      expect(stats).toEqual({ todayNetTotalKobo: 0n, overdueInstallmentCount: 0, activePlanCount: 0 });
    });

    test('activePlanCount counts only Plans with status=ACTIVE and deletedAt=null', async () => {
      const ctx = ctxFor(TENANT_A);
      // 1 ACTIVE
      await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 6, monthlyKobo: 100_00n });
      // 1 DRAFT (createPlan default)
      const cust = await createCustomer(ctx, { fullName: 'Draft Buyer', phone: '+2348011110000' });
      const prop = await createProperty(ctx, { code: nextCode(), title: 'Unit', addressLine: 'x', city: 'Lagos', totalPriceKobo: 600_00n as Kobo });
      await createPlan(ctx, {
        customer: { mode: 'existing', id: cust.id },
        propertyId: prop.id,
        totalPriceKobo: 600_00n as Kobo,
        depositKobo: 0n as Kobo,
        monthlyKobo: 100_00n as Kobo,
        termMonths: 6,
        startDate: new Date('2026-01-01'),
        depositReceived: false,
      });
      // 1 CANCELLED
      const cancelled = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 6, monthlyKobo: 100_00n });
      await pg.prisma.plan.update({ where: { id: cancelled.planId }, data: { status: 'CANCELLED' } });
      // 1 soft-deleted ACTIVE
      const deleted = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 6, monthlyKobo: 100_00n });
      await pg.prisma.plan.update({ where: { id: deleted.planId }, data: { deletedAt: new Date() } });

      const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
      expect(stats.activePlanCount).toBe(1);
    });

    test('overdueInstallmentCount counts installments with status!=PAID and dueDate<now', async () => {
      const ctx = ctxFor(TENANT_A);
      // Plan starting 2026-01-01 with 6 monthly installments → due 2026-02..2026-07
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 6, monthlyKobo: 100_00n });
      // Mark the 2026-02 installment as PAID so it doesn't count as overdue
      await pg.prisma.installment.updateMany({
        where: { planId, sequenceNo: 1 },
        data: { status: 'PAID', amountPaidKobo: 100_00n },
      });
      // now = 2026-05-17 → overdue are seq 2,3,4 (Mar/Apr/May), excluding seq 1 (PAID) and seq 5,6 (future)
      const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
      expect(stats.overdueInstallmentCount).toBe(3);
    });

    test('overdueInstallmentCount excludes installments on soft-deleted plans', async () => {
      const ctx = ctxFor(TENANT_A);
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 3, monthlyKobo: 100_00n });
      await pg.prisma.plan.update({ where: { id: planId }, data: { deletedAt: new Date() } });
      const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
      expect(stats.overdueInstallmentCount).toBe(0);
    });

    test('todayNetTotalKobo sums payments in the Lagos-local day window, net of reversals', async () => {
      const ctx = ctxFor(TENANT_A);
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-05-01'), installmentCount: 6, monthlyKobo: 100_00n });
      // Record payment dated inside the Lagos 2026-05-17 window
      const seq1 = await pg.prisma.installment.findFirstOrThrow({ where: { planId, sequenceNo: 1 } });
      const inWindow = new Date('2026-05-17T10:00:00Z'); // Lagos 11:00 same day
      const recorded = await recordPayment(ctx, {
        planId,
        amountKobo: 100_00n as Kobo,
        paidAt: inWindow,
        method: 'CASH',
        allocations: [{ installmentId: seq1.id, amountKobo: 100_00n as Kobo }],
      });
      // Force the reversal's paidAt into the same Lagos day so we test net=0
      const reversed = await reversePayment(ctx, { paymentId: recorded.paymentId, reason: 'test' });
      await pg.prisma.payment.update({ where: { id: reversed.reversalPaymentId }, data: { paidAt: inWindow } });

      const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
      expect(stats.todayNetTotalKobo).toBe(0n);
    });

    test('todayNetTotalKobo excludes payments outside the Lagos-local day', async () => {
      const ctx = ctxFor(TENANT_A);
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-05-01'), installmentCount: 6, monthlyKobo: 100_00n });
      const seq1 = await pg.prisma.installment.findFirstOrThrow({ where: { planId, sequenceNo: 1 } });
      // 2026-05-16T22:30Z == Lagos 2026-05-16 23:30 (prior day) → out of window
      const outOfWindow = new Date('2026-05-16T22:30:00Z');
      await recordPayment(ctx, {
        planId,
        amountKobo: 100_00n as Kobo,
        paidAt: outOfWindow,
        method: 'CASH',
        allocations: [{ installmentId: seq1.id, amountKobo: 100_00n as Kobo }],
      });
      const stats = await getDashboardStats(ctx, new Date('2026-05-17T13:30:00Z'));
      expect(stats.todayNetTotalKobo).toBe(0n);
    });
  });

  describe('listRecentActivity', () => {
    test('returns up to limit rows ordered by paidAt desc', async () => {
      const ctx = ctxFor(TENANT_A);
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 12, monthlyKobo: 100_00n });
      const installments = await pg.prisma.installment.findMany({ where: { planId }, orderBy: { sequenceNo: 'asc' } });
      // Record 12 payments at descending paidAt
      for (let i = 0; i < 12; i++) {
        const paidAt = new Date(Date.UTC(2026, 4, 1 + i, 10)); // 2026-05-01..2026-05-12
        await recordPayment(ctx, {
          planId,
          amountKobo: 100_00n as Kobo,
          paidAt,
          method: 'CASH',
          allocations: [{ installmentId: installments[i].id, amountKobo: 100_00n as Kobo }],
        });
      }
      const rows = await listRecentActivity(ctx, 10);
      expect(rows).toHaveLength(10);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].paidAt.getTime()).toBeGreaterThanOrEqual(rows[i].paidAt.getTime());
      }
    });

    test('isReversal=true for reversal rows, false for originals', async () => {
      const ctx = ctxFor(TENANT_A);
      const { planId } = await seedActivePlan({ ctx, startDate: new Date('2026-01-01'), installmentCount: 3, monthlyKobo: 100_00n });
      const seq1 = await pg.prisma.installment.findFirstOrThrow({ where: { planId, sequenceNo: 1 } });
      const recorded = await recordPayment(ctx, {
        planId,
        amountKobo: 100_00n as Kobo,
        paidAt: new Date('2026-05-10T10:00:00Z'),
        method: 'CASH',
        allocations: [{ installmentId: seq1.id, amountKobo: 100_00n as Kobo }],
      });
      await reversePayment(ctx, { paymentId: recorded.paymentId, reason: 'test' });
      const rows = await listRecentActivity(ctx, 10);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.amountKobo < 0n)?.isReversal).toBe(true);
      expect(rows.find((r) => r.amountKobo > 0n)?.isReversal).toBe(false);
    });

    test('excludes payments from other tenants (forTenant guard)', async () => {
      const ctxA = ctxFor(TENANT_A);
      const ctxB = ctxFor(TENANT_B);
      const { planId: planB } = await seedActivePlan({ ctx: ctxB, startDate: new Date('2026-01-01'), installmentCount: 3, monthlyKobo: 100_00n });
      const seqB = await pg.prisma.installment.findFirstOrThrow({ where: { planId: planB, sequenceNo: 1 } });
      await recordPayment(ctxB, {
        planId: planB,
        amountKobo: 100_00n as Kobo,
        paidAt: new Date('2026-05-10T10:00:00Z'),
        method: 'CASH',
        allocations: [{ installmentId: seqB.id, amountKobo: 100_00n as Kobo }],
      });
      const rowsForA = await listRecentActivity(ctxA, 10);
      expect(rowsForA).toEqual([]);
    });
  });
});
```

> **Why exact field names matter:** `recordPayment` and `reversePayment` return shapes defined in `packages/db/src/payments-service.ts` — `paymentId` and `reversalPaymentId` respectively. Before writing the tests, run `grep -n "export type.*Result" packages/db/src/payments-service.ts` and align field names with the actual returns. The names above match the current shape (`RecordPaymentResult` at line 183, `ReversePaymentResult` at line 176) but the implementer must double-check, not paste blindly.

> **Why `TRUNCATE` instead of dropping the container:** the existing tests share a single `startPostgres()` per file (via `beforeAll`) — full container restart per test would balloon CI time. `TRUNCATE … RESTART IDENTITY CASCADE` is fast and isolates each test. If a test wants a clean tenant baseline, this pattern handles it; if isolation breaks for some reason, fall back to per-test container.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @solutio/db test dashboard-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `packages/db/src/dashboard-service.ts` with the function bodies sketched above. Match the import + `forTenant` style of `packages/db/src/payments-service.ts` verbatim (same `prisma`, same `Kobo` import, same `PaymentMethod` import from `@prisma/client`).

- [ ] **Step 4: Wire the barrel**

Edit `packages/db/src/index.ts` — add:
```ts
export { getDashboardStats, listRecentActivity } from './dashboard-service.ts';
export type { DashboardStats, RecentActivityRow } from './dashboard-service.ts';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @solutio/db test dashboard-service`
Expected: PASS — all assertions green.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/dashboard-service.ts packages/db/src/index.ts packages/db/__tests__/dashboard-service.integration.test.ts
git commit -m "feat(db): add dashboard-service with stats + recent-activity queries"
```

**Acceptance:**
- [ ] `pnpm -F @solutio/db test dashboard-service` passes against a real Postgres testcontainer
- [ ] Coverage on `dashboard-service.ts` ≥ 80%
- [ ] `packages/db/src/index.ts` re-exports the two functions and both result types

---

## Task 3 — `<StatCard />` + `<RecentActivityTable />` components

**Files:**
- Create: `apps/web/components/dashboard/stat-card.tsx`
- Create: `apps/web/components/dashboard/recent-activity-table.tsx`
- Create: `apps/web/components/dashboard/__tests__/recent-activity-table.test.tsx`

### `<StatCard />`

Plain server component. Props:

```ts
interface StatCardProps {
  label: string;
  value: string;       // pre-formatted (formatKobo / count.toString())
  hint?: string;       // optional sub-label
  tone?: 'default' | 'warning' | 'success' | 'destructive'; // colorizes the value
}
```

Renders a shadcn `Card` with `<CardHeader>` (label) + `<CardContent>` (value at `text-3xl font-semibold`). Tone maps to Tailwind text colors (`text-amber-600`, `text-emerald-600`, `text-destructive`). No client JS.

### `<RecentActivityTable />`

Server component. Props:

```ts
interface RecentActivityTableProps {
  rows: ReadonlyArray<RecentActivityRow>;
}
```

Renders shadcn `Table` with columns: When (formatted `paidAt`), Customer, Property, Method, Amount (formatted via `formatKobo`; reversal rows get a `text-destructive` + leading "↩" marker), Link (`<Link href={'/plans/' + row.planId + '?tab=payments#payment-' + row.id as Route}>View →</Link>`). Empty state: `<div className="text-sm text-muted-foreground py-8 text-center">No payments yet. Activity will appear here as your team records collections.</div>`.

Date formatter: defined inline at module scope so it's instantiated once:

```ts
const formatter = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  dateStyle: 'medium',
  timeStyle: 'short',
});
function formatWhen(d: Date): string {
  return formatter.format(d);
}
```

### Tests (`recent-activity-table.test.tsx`, jsdom)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/components/dashboard/__tests__/recent-activity-table.test.tsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentActivityTable } from '../recent-activity-table.tsx';
import type { RecentActivityRow } from '@solutio/db/dashboard-service';
import type { Kobo } from '@solutio/shared/money';

const fakeRow = (overrides: Partial<RecentActivityRow> = {}): RecentActivityRow => ({
  id: 'pay-1',
  planId: 'plan-1',
  amountKobo: 50_000_00n as Kobo,
  paidAt: new Date('2026-05-17T10:00:00Z'),
  method: 'CASH',
  isReversal: false,
  customerName: 'Ada Lovelace',
  propertyCode: 'AH-001',
  ...overrides,
});

describe('<RecentActivityTable />', () => {
  test('renders empty state when rows is []', () => {
    render(<RecentActivityTable rows={[]} />);
    expect(screen.getByText(/no payments yet/i)).toBeInTheDocument();
  });

  test('renders one row per payment with customer + property + amount + link', () => {
    render(<RecentActivityTable rows={[fakeRow()]} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AH-001')).toBeInTheDocument();
    expect(screen.getByText('₦50,000.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute(
      'href',
      '/plans/plan-1?tab=payments#payment-pay-1',
    );
  });

  test('flags reversal rows with negative amount + marker', () => {
    render(
      <RecentActivityTable
        rows={[fakeRow({ id: 'pay-2', amountKobo: -50_000_00n as Kobo, isReversal: true })]}
      />,
    );
    const amount = screen.getByText(/-₦50,000\.00/);
    expect(amount).toBeInTheDocument();
    expect(screen.getByText('↩')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F web test recent-activity-table`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the components**

Implement both files per the specs above, matching the import style of existing `apps/web/components/plans/*.tsx`. Use shadcn primitives from `@/components/ui/{card,table}` (already installed — confirm with `ls apps/web/components/ui/`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F web test recent-activity-table`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/stat-card.tsx apps/web/components/dashboard/recent-activity-table.tsx apps/web/components/dashboard/__tests__/recent-activity-table.test.tsx
git commit -m "feat(web): add dashboard stat-card + recent-activity-table components"
```

**Acceptance:**
- [ ] Vitest passes the recent-activity-table jsdom test
- [ ] No client `'use client'` directive on either component (verify by `grep -L "use client" apps/web/components/dashboard/*.tsx` — both files should be in the output)

---

## Task 4 — Rewrite `app/(authenticated)/page.tsx` (the dashboard)

**Files:**
- Modify: `apps/web/app/(authenticated)/page.tsx`

**Final structure (top to bottom):**

1. Auth gate (unchanged)
2. Page title + signed-in line: keep the `<h1>Dashboard</h1>` (renamed from "Welcome to Solutio") and the small "Signed in as…" line — useful for support
3. **3-up `<StatCard />` grid:** Today's payments (net), Overdue installments, Active plans. Tone = `warning` when `overdueInstallmentCount > 0`; tone = `destructive` for today's-total when negative; default otherwise.
4. **Recent activity section** with `<h2>Recent activity</h2>` + `<RecentActivityTable />`
5. **Quick links** row: keep the three existing nav cards (Customers / Properties / Plans). Heading: `<h2>Quick links</h2>`.
6. Sign-out form: keep as-is at the bottom.

**Page body:**

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { signOutAction } from '@/server-actions/sign-out';
import { getDashboardStats, listRecentActivity } from '@solutio/db/dashboard-service';
import { formatKobo } from '@solutio/shared/money';
import { StatCard } from '@/components/dashboard/stat-card';
import { RecentActivityTable } from '@/components/dashboard/recent-activity-table';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(ctx),
    listRecentActivity(ctx, 10),
  ]);

  const todayTone: 'default' | 'destructive' =
    stats.todayNetTotalKobo < 0n ? 'destructive' : 'default';
  const overdueTone: 'default' | 'warning' =
    stats.overdueInstallmentCount > 0 ? 'warning' : 'default';

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <span className="font-medium">{ctx.user.email}</span> ({ctx.user.role}).
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Today's payments"
          value={formatKobo(stats.todayNetTotalKobo)}
          hint="Net of reversals, Lagos time"
          tone={todayTone}
        />
        <StatCard
          label="Overdue installments"
          value={stats.overdueInstallmentCount.toString()}
          hint="Past due and not yet paid"
          tone={overdueTone}
        />
        <StatCard
          label="Active plans"
          value={stats.activePlanCount.toString()}
          hint="Plans currently collecting"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivityTable rows={recentActivity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* keep the existing three Link cards verbatim */}
        </div>
      </section>

      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 1: Edit `apps/web/app/(authenticated)/page.tsx`** to match the structure above, preserving the three existing `<Link>` cards inside the Quick Links section.

- [ ] **Step 2: Manual smoke test**

Run: `pnpm -F web dev`
Sign in as OWNER. Confirm the dashboard renders three cards + an empty-state activity table (or rows if the dev DB has Payments). Confirm overdue card tints amber when value > 0. Confirm a reversal row in recent activity shows the `↩` marker + negative amount in red.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean — no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(authenticated\)/page.tsx
git commit -m "feat(web): replace welcome page with M7 dashboard (stats + activity)"
```

**Acceptance:**
- [ ] Page renders three stat cards with live values
- [ ] Recent activity table shows up to 10 most-recent Payment rows with reversal marker
- [ ] Existing Quick Links cards still navigate to /customers, /properties, /plans
- [ ] No client-component boundary added — view source: page is server-rendered

---

## Task 5 — Cache invalidation on payment write actions

The dashboard is `force-dynamic` (no static cache to invalidate), but the existing payment-record and payment-reverse server actions should still call `revalidatePath('/')` so that any in-flight RSC fetcher gets the freshest data and a user clicking Home immediately after a payment sees the new row.

**Files:**
- Modify: `apps/web/server-actions/payments/record.ts` — add `revalidatePath('/')` to the success path
- Modify: `apps/web/server-actions/payments/reverse.ts` (or whatever the M5 reverse action file is — check before editing) — add `revalidatePath('/')` to the success path

- [ ] **Step 1: Confirm the file names + current `revalidatePath` calls**

Run: `grep -rn "revalidatePath" apps/web/server-actions/payments/`

- [ ] **Step 2: Add `revalidatePath('/')` to each success branch**

Edit each action's success branch. Do not touch the failure branches.

- [ ] **Step 3: Run the existing payment-action tests to ensure no regression**

Run: `pnpm -F web test server-actions/payments`
Expected: all green; existing `revalidatePath` assertions still pass; if a test asserts the exact set of `revalidatePath` calls, extend the assertion to include `'/'`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server-actions/payments/record.ts apps/web/server-actions/payments/reverse.ts apps/web/server-actions/__tests__/  # only the affected test files
git commit -m "feat(web): revalidate dashboard on payment record + reverse"
```

**Acceptance:**
- [ ] Existing payment-action tests pass
- [ ] `revalidatePath('/')` is in both success paths

---

## Task 6 — Extend the Phase 1a closeout E2E to assert dashboard state

The spec's Phase 1a closeout E2E (§286) is the single end-to-end journey for Phase 1a. M7 must add the final assertion block: after the record + reverse cycle, navigate to `/` and verify (a) today's-payments card reads `₦0.00` (net), (b) active-plans card reads `1` (the plan created in the flow), and (c) the recent-activity table contains two rows for the plan — one positive original, one negative reversal — both linking back to the plan.

**Files:**
- Modify: the closeout E2E file. Likely `apps/web/e2e/closeout.e2e.ts` if it exists; otherwise the longest M4/M5 E2E that covers record + reverse (check `ls apps/web/e2e/`). **Do not create a new e2e file.**

- [ ] **Step 1: Locate the closeout E2E**

Run: `ls apps/web/e2e/ && grep -l "reverse\|reversal" apps/web/e2e/*.ts`

- [ ] **Step 2: Append the dashboard assertion block** at the end of the existing test, after the record+reverse cycle:

```ts
// Final M7 assertion: dashboard reflects net state
await page.goto('/');
await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

// Today's payments card — net = 0 because the reversal cancels the original
await expect(page.getByText(/today's payments/i)).toBeVisible();
await expect(page.getByText('₦0.00')).toBeVisible();

// Active plans card — exactly 1
const activeCard = page.locator('section', { hasText: /active plans/i });
await expect(activeCard.getByText('1')).toBeVisible();

// Recent activity has two rows for this plan (original + reversal)
const activityTable = page.getByRole('table');
await expect(activityTable).toBeVisible();
const planLinks = activityTable.getByRole('link', { name: /view/i });
await expect(planLinks).toHaveCount(2);
// Reversal marker visible
await expect(activityTable.getByText('↩')).toBeVisible();
```

- [ ] **Step 3: Run the E2E lane**

Run: `pnpm -F web e2e`
Expected: green, including the new assertions.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/<the-file-you-edited>.ts
git commit -m "test(e2e): assert dashboard reflects net state in Phase 1a closeout"
```

**Acceptance:**
- [ ] Closeout E2E green
- [ ] No new e2e file created
- [ ] No `console.error` during the run

---

## Cross-cutting acceptance (M7 closeout = Phase 1a closeout)

- [ ] `pnpm -F @solutio/shared test`, `pnpm -F @solutio/db test`, `pnpm -F web test`, `pnpm -F web e2e` all green
- [ ] Vitest line coverage ≥ 80% on all new code; ≥ 95% on `@solutio/shared/installments` and `@solutio/shared/payments` (unchanged — M7 doesn't touch them)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean; no new `ts-prune` unused exports
- [ ] `pnpm prisma:diff` clean against shadow DB (M7 ships zero schema changes — this verifies that)
- [ ] M1–M6 e2e lanes still green (no regression)
- [ ] Squash-merge to `main` via PR titled `feat(M7): home dashboard polish (Phase 1a closeout)`; rms image rebuild + ArgoCD sync per the Phase 0 deploy pipeline (subsequent `chore(deploy)` PR bumps the image tag)
- [ ] After the deploy PR merges, Phase 1a is closed — note this in the Phase 1a spec or a closeout PR description

---

## Risks & mitigations specific to M7

| Risk | Mitigation |
|---|---|
| `Intl.DateTimeFormat` `longOffset` produces an unexpected string in the runtime's ICU build | Test asserts on the parsed window, not on the raw string. If the runtime's `longOffset` is missing on some platforms, fall back to a hard-coded `+01:00` (Lagos has no DST). Note this in a code comment. |
| Dashboard query is slow on a tenant with millions of payments | Phase 1a tenant has dozens of plans; indexes `Payment(tenantId, planId, paidAt)` already exist. Re-evaluate when a tenant crosses 100k payments. |
| `payment.aggregate._sum.amountKobo` returns `null` on an empty result | Already handled with `?? 0n` in the service. Test covers the zero-state case. |
| Three round-trips slow page render | All three queries run inside a single `$transaction([...])` so it's one wire round-trip with three statements. |
| Reversal row's `paidAt` differs from the original's `paidAt` and skews the today total | Verified in `payments-service.ts` — reversal `paidAt` is set inside the action (today). This is the intended semantic: "today's payments" includes today's reversals regardless of when the original was. The test `todayNetTotalKobo sums payments…` exercises exactly this. |
| Anchor link `#payment-{id}` doesn't scroll because the Payments tab isn't selected | Best-effort UX. Phase 1a does not require deep-link payment view. If users complain, M8 can add a `?tab=payments` reader on the plan-detail page. |
| Site nav looks redundant alongside Quick Links | Decision #3 documents the rationale (sparse-page concern for empty-tenant STAFF). If team review disagrees, delete the Quick Links section in Task 4 — no other file changes needed. |
| `revalidatePath('/')` on every payment action causes RSC re-render storm | `/` is a single page; one revalidation per action is the correct cost. |

---

## References

- Spec: `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §M7
- M3 plan (precedent for structure + conventions): `docs/superpowers/plans/2026-05-15-phase-1a-m3-plan-create.md`
- M6 plan: `docs/superpowers/plans/2026-05-16-phase-1a-m6-users-management.md`
- Existing payments service (read patterns to mirror): `packages/db/src/payments-service.ts`
- Reversal row shape (`amountKobo` stored negative, `reversedById` set): `packages/db/src/payments-service.ts:627`
- Money formatting (negative-aware): `packages/shared/src/money/kobo.ts` + tests
- Memory anchors: `feedback_no_js_suffix_in_shared_src`, `feedback_apps_web_imports_db_via_submodules`, `feedback_service_functions_own_prisma_internally`, `feedback_service_layer_explicit_ctx_param`, `feedback_subagents_must_verify_branch_before_committing`, `project_solutio_phase0_anchors`
