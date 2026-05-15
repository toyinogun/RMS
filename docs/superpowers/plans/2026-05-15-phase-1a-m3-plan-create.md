# Phase 1a · M3 — Plan Create + Materialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M3 from the Phase 1a design spec — Plan list, inline-everything create (DRAFT-only in M3), tabbed plan detail showing the materialized installment schedule, and a cancel action that's blocked once any Payment exists. The deposit toggle is rendered disabled with a "Available in M4" hint per locked decision §4.

**Architecture:** Plan create reuses the existing `generateSchedule()` pure fn from `@solutio/shared/installments` (spec calls this `materialize()`; the codebase already implements it). New Zod schemas land in `@solutio/shared/installments/schemas.ts` (plan-create input, plan-cancel input, list-filter input). A new `plans-service.ts` in `@solutio/db` exposes `createPlan` / `cancelPlan` / `listPlans` / `getPlan`, all routed through `forTenant(ctx.tenantId).$transaction([...])`. Server actions in `apps/web/server-actions/plans/{create,cancel}.ts` resolve `ctx`, parse input, call the service, then `revalidatePath`. The plan-create page mounts a single client form that wires the existing `CustomerCreateDialog` and `PropertyCreateDialog` for the inline new-entity case, plus comboboxes for picking an existing Customer or AVAILABLE Property. The detail page renders shadcn `Tabs` with Installments populated and Payments/Actions as placeholders (M4/M5 will fill them).

**Tech Stack:** Next.js 16 RSC + Server Actions · Prisma 7 (`forTenant` extension) · Zod · react-hook-form + `@hookform/resolvers/zod` · shadcn/ui (already installed: button/input/label/select/dialog/table/tabs/badge/form/sonner) · Vitest (jsdom for components, testcontainers/postgres for DB integration) · Playwright (extend the M2 lane with M3 happy path).

**Spec sections this plan implements:** `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §M3 (lines 231–242), plus the central-transaction data flow §134, Architecture §57–124, and Validation §186–195.

**Open question resolved (spec §320):** Plan terms are **immutable once created**. There is no edit-plan flow; the only way to change terms on a DRAFT plan is `cancel + recreate`. This keeps the materialization step single-shot and removes a class of re-materialization edge cases.

**Out of scope for M3 (locked by spec):**
- Plan ACTIVE transition + deposit recording (M4 enables the toggle; M3 creates DRAFT only)
- Property auto-flip AVAILABLE → SOLD (only reachable from ACTIVE-transition, which M4 owns; the M3 service must **not** attempt the flip)
- Payments tab content and Reverse action UI on plan detail (M4 / M5)
- COMPLETED / DEFAULTED state transitions (M4 / future)
- MoneyInput refinement beyond what M2 + plain inputs already provide (revisit if M3 UX demands it; not a blocker)

---

## File map

**Create:**
- `packages/shared/src/installments/schemas.ts` — `planCreateSchema`, `planCancelSchema`, `planListFilterSchema`, exported input types
- `packages/shared/src/installments/__tests__/schemas.test.ts`
- `packages/db/src/plans-service.ts`
- `packages/db/src/__tests__/plans-service.integration.test.ts`
- `apps/web/server-actions/plans/create.ts`
- `apps/web/server-actions/plans/cancel.ts`
- `apps/web/server-actions/__tests__/plans-create.test.ts`
- `apps/web/server-actions/__tests__/plans-cancel.test.ts`
- `apps/web/app/(authenticated)/plans/page.tsx` (list + status filter)
- `apps/web/app/(authenticated)/plans/new/page.tsx` (RSC wrapper)
- `apps/web/app/(authenticated)/plans/[id]/page.tsx` (tabbed detail)
- `apps/web/components/plans/plan-form.tsx` (client; inline-everything)
- `apps/web/components/plans/customer-combobox.tsx` (client; uses existing `CustomerCreateDialog`)
- `apps/web/components/plans/property-combobox.tsx` (client; AVAILABLE-only; uses existing `PropertyCreateDialog`)
- `apps/web/components/plans/installments-table.tsx` (server-renderable)
- `apps/web/components/plans/plan-cancel-button.tsx` (client; confirm dialog)
- `apps/web/components/plans/__tests__/plan-form.test.tsx`
- `apps/web/components/plans/__tests__/installments-table.test.tsx`
- `apps/web/e2e/m3-plan-create.e2e.ts`

**Modify:**
- `packages/shared/src/installments/index.ts` — re-export the new schemas + types
- `packages/db/src/index.ts` — export the new service functions + error classes + input types
- `apps/web/app/(authenticated)/page.tsx` — add a third home card linking to `/plans`
- `apps/web/components/site-nav.tsx` — add Plans link between Properties and (existing) Users gating

**Touch only if a step requires it (do NOT modify pre-emptively):**
- `packages/db/prisma/schema.prisma` — M3 ships zero schema changes. If a step appears to require one, stop and escalate.

---

## Cross-cutting conventions (read before starting Task 1)

These are the established conventions from M1/M2. Re-stated here so the implementer doesn't have to re-derive them.

1. **No `.js` suffix in `packages/{shared,db}/src/**`.** Project uses Bundler moduleResolution; Turbopack rejects `.js → .ts` mapping. Test files keep the suffix. Per memory `feedback_no_js_suffix_in_shared_src`.
2. **`apps/web` imports `@solutio/db` via submodule paths only** — `@solutio/db/client`, `@solutio/db/tenant-client`, `@solutio/db/plans-service`. Never the barrel. Per memory `feedback_apps_web_imports_db_via_submodules`.
3. **Service functions own `prisma` internally** and take `(ctx, input)`. They never take `prisma` as a parameter, and `apps/web` pages/actions must never import `@solutio/db/client`. Per memory `feedback_service_functions_own_prisma_internally`.
4. **forTenant writes need `satisfies Omit<Prisma.<Model>UncheckedCreateInput, 'tenantId'>` + `as unknown as Prisma.<Model>UncheckedCreateInput`** because `$extends` injects tenantId at runtime but static types don't reflect that. Pattern is established in `packages/db/src/customers-service.ts` and `payments-service.ts` — copy that structure. Per memory `feedback_prisma_fortenant_needs_cast`.
5. **Soft-delete pattern:** every list query filters `where: { deletedAt: null }`. Partial indexes already exist on Customer / Property. Plan also has `deletedAt` — list queries must filter it out.
6. **Server-action return contract:** `{ ok: true, data } | { ok: false, message, fieldErrors? }` (spec §195). Throw nothing back to the client; map Prisma errors here.
7. **Server actions use `hasRole` + early return, not `requireRole`.** Preserves the discriminated union; throwing escapes to Next's error boundary. Per memory `feedback_server_actions_use_hasRole_not_requireRole`.
8. **Auth gate:** `app/(authenticated)/layout.tsx` already enforces auth; every M3 page must call `await getTenantContext()` and `redirect('/login')` if null (defense-in-depth).
9. **Money:** Plan stores `totalPriceKobo` / `depositKobo` / `monthlyKobo` as BigInt. Form inputs are free-form NGN strings; Zod runs them through `parseNgn`. Display uses `formatKobo`.
10. **`createdBy`:** every create writes `createdBy: ctx.user.id`. Cancel does **not** touch it.
11. **Service-layer functions take explicit `TenantContext` as first param**, never call ambient `getTenantContext()`. Per memory `feedback_service_layer_explicit_ctx_param`.

---

## Task 1 — Plan Zod schemas in `@solutio/shared/installments`

**Files:**
- Create: `packages/shared/src/installments/schemas.ts`
- Create: `packages/shared/src/installments/__tests__/schemas.test.ts`
- Modify: `packages/shared/src/installments/index.ts` — re-export schemas + types

**Schemas to define:**

- `planCreateSchema` — discriminated input that accepts either an existing-customer or new-customer payload, plus required `propertyId`, plan terms, and an explicit `depositReceived: false` flag (literal `false` in M3 to enforce the locked rule; M4 widens this).
  - `customer`: `z.discriminatedUnion('mode', [{ mode: 'existing', id: uuid }, { mode: 'new', fullName, phone, email?, nationalId?, notes? }])` — reuse `customerCreateSchema`'s field rules via composition, not duplication
  - `propertyId`: uuid
  - `totalPriceKobo` / `depositKobo` / `monthlyKobo`: NGN string → Kobo via `parseNgn` (use `z.preprocess` or `.transform`). All three must satisfy `>= 0n`. `totalPriceKobo` must be `> 0n`.
  - `termMonths`: integer `6..36` (matches `generateSchedule`'s `MIN_TERM`/`MAX_TERM`)
  - `startDate`: ISO date string → `Date`. Refine: not in the past beyond a 1-day grace (allow today).
  - `depositReceived`: `z.literal(false)` for M3. Add a comment that M4 widens this.
  - Cross-field refine: `depositKobo <= totalPriceKobo`; `depositKobo + (monthlyKobo * termMonths) >= totalPriceKobo` (matches the `generateSchedule` underfund guard) — duplicate the check at the schema boundary so the form sees the error before the DB transaction starts.

- `planCancelSchema` — `{ id: uuid }`.

- `planListFilterSchema` — `{ status?: PlanStatus | 'ALL'; q?: string }`. `q` is optional free-text searched against customer name / property code (server does the LIKE).

**Tests (Vitest, pure):**
- planCreateSchema parses valid input (existing customer, NGN strings → BigInt)
- planCreateSchema parses valid input (new customer)
- planCreateSchema rejects negative deposit, deposit > total, underfunded plan, termMonths out of range
- planCreateSchema rejects `depositReceived: true` with a clear error message ("Recording deposit at plan creation will be enabled in M4")
- planCreateSchema rejects past startDate beyond grace
- planCancelSchema accepts a uuid, rejects non-uuid
- planListFilterSchema accepts valid status, defaults `q` to undefined

**Acceptance:**
- [ ] `pnpm -F @solutio/shared test installments/schemas` passes
- [ ] Coverage on `installments/schemas.ts` ≥ 95% (spec cross-cutting requirement)
- [ ] `packages/shared/src/installments/index.ts` re-exports the new schemas and the derived input types

---

## Task 2 — `plans-service` in `@solutio/db`

**Files:**
- Create: `packages/db/src/plans-service.ts`
- Modify: `packages/db/src/index.ts` — export functions + error classes + input types

**Functions:**

- `createPlan(ctx: TenantContext, input: PlanCreateInput): Promise<{ id: string }>` — inside `forTenant(prisma, ctx.tenantId).$transaction(async (tx) => { ... })`:
  1. Resolve `customerId`: if `input.customer.mode === 'new'`, `tx.customer.create({ ... createdBy: ctx.user.id })`. Else, `tx.customer.findUnique({ where: { id, deletedAt: null } })` → throw `CustomerNotFoundError` if missing.
  2. Re-read the property inside the transaction: `tx.property.findUnique({ where: { id: input.propertyId } })`. Throw `PropertyNotFoundError` if missing or soft-deleted. Throw `PropertyNotAvailableError` if `status !== 'AVAILABLE'`.
  3. `tx.plan.create({ data: { customerId, propertyId, totalPriceKobo, depositKobo, monthlyKobo, termMonths, startDate, status: 'DRAFT', createdBy: ctx.user.id } satisfies Omit<Prisma.PlanUncheckedCreateInput, 'tenantId'> as unknown as ... })`. **No ACTIVE transition in M3.** **No property flip in M3.**
  4. Compute the schedule: `generateSchedule({ totalPriceKobo, depositKobo, monthlyKobo, termMonths, startDate })`.
  5. `tx.installment.createMany({ data: rows.map(r => ({ planId: plan.id, sequenceNo: r.sequenceNo, dueDate: r.dueDate, amountDueKobo: r.amountDueKobo, status: 'PENDING' satisfies ... })) })`.
  6. Return `{ id: plan.id }`.

- `cancelPlan(ctx: TenantContext, input: { id: string }): Promise<void>` — inside transaction:
  1. `tx.plan.findUnique({ where: { id }, include: { payments: { where: { /* any */ }, select: { id: true }, take: 1 } } })`. Throw `PlanNotFoundError` if missing or `deletedAt`.
  2. If `plan.status === 'CANCELLED'`, no-op (idempotent).
  3. If `plan.payments.length > 0`, throw `PlanHasPaymentsError` — clerk must reverse payments first (spec locked decision §7).
  4. `tx.plan.update({ where: { id }, data: { status: 'CANCELLED' } })`. Per the resolved open question, **terms are immutable** — no extra fields touched.
  5. Installments stay in place (no delete) — they represent historical state and the unique `(planId, sequenceNo)` index forbids resurrection anyway.

- `listPlans(ctx: TenantContext, filter: PlanListFilterInput): Promise<PlanListRow[]>`
  - `where: { deletedAt: null, ...(filter.status && filter.status !== 'ALL' ? { status: filter.status } : {}), ...(filter.q ? { OR: [{ customer: { fullName: { contains: filter.q, mode: 'insensitive' } } }, { property: { code: { contains: filter.q, mode: 'insensitive' } } }] } : {}) }`
  - `select` only what the list view shows: id, status, createdAt, customer.fullName, property.code, totalPriceKobo, termMonths
  - Order by `createdAt desc`

- `getPlan(ctx: TenantContext, id: string)` — single plan with customer (id, fullName), property (id, code, status), installments (ordered by sequenceNo). Throws `PlanNotFoundError` if missing or soft-deleted.

**Error classes:**
- `PlanNotFoundError`
- `PlanHasPaymentsError`
- `PropertyNotAvailableError` (new — different from M2's `PropertyStatusChangeBlockedError`; this one fires at plan-create when property is not AVAILABLE)

**Integration tests (testcontainers/postgres, real Prisma):**
- `createPlan` happy path with existing customer + AVAILABLE property → DRAFT plan with N+1 installments (seq 0..N), deposit installment seq=0
- `createPlan` happy path with new-customer payload → customer row created inside same transaction
- `createPlan` throws `PropertyNotAvailableError` when property is RESERVED or SOLD; transaction rolls back (no plan, no customer-side-effect)
- `createPlan` throws `CustomerNotFoundError` for soft-deleted customer id
- `cancelPlan` flips DRAFT plan to CANCELLED
- `cancelPlan` is idempotent on an already-CANCELLED plan
- `cancelPlan` throws `PlanHasPaymentsError` when any Payment row references the plan (seed one directly via `prisma.payment.create` bypassing service)
- `listPlans` filters by status, by `q` against customer name and property code, and excludes soft-deleted rows
- `getPlan` returns installments ordered by sequenceNo

**Acceptance:**
- [ ] `pnpm -F @solutio/db test plans-service` passes against a real Postgres testcontainer
- [ ] Coverage on `plans-service.ts` ≥ 80%
- [ ] `packages/db/src/index.ts` re-exports `createPlan`, `cancelPlan`, `listPlans`, `getPlan`, all error classes, and the input types

---

## Task 3 — Plan server actions

**Files:**
- Create: `apps/web/server-actions/plans/create.ts`
- Create: `apps/web/server-actions/plans/cancel.ts`
- Create: `apps/web/server-actions/__tests__/plans-create.test.ts`
- Create: `apps/web/server-actions/__tests__/plans-cancel.test.ts`

**`createPlanAction(_prev, formData)`:**
- Resolve `ctx` via `getTenantContext()`; early-return `{ ok: false, message: 'Not signed in' }` if null
- `hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])` else `{ ok: false, message: 'Forbidden' }`
- Parse formData via `planCreateSchema.safeParse(...)`. The form serializes nested `customer` as either `customerMode=existing` + `customerId` or `customerMode=new` + the customer fields; reconstruct the discriminated-union shape before parsing. Money fields are NGN strings.
- Call `createPlan(ctx, parsed.data)`
- Map `PropertyNotAvailableError` → `{ ok: false, message: 'That property is no longer available. Refresh and try again.' }`
- Map `CustomerNotFoundError` → `{ ok: false, message: 'Selected customer no longer exists. Refresh and try again.' }`
- Other Prisma errors fall through to a generic message + server `console.error`
- `revalidatePath('/plans')`; `revalidatePath('/properties')` (property may show "has plans" later — safe to revalidate); return `{ ok: true, data: { id } }`

**`cancelPlanAction(_prev, formData)`:**
- Same auth pattern; `hasRole(ctx, ['OWNER', 'ADMIN'])` only — STAFF cannot cancel (matches the spirit of the role-gated reverse action in M5; clerks shouldn't be able to nuke their own DRAFTs without an ADMIN. If we want STAFF in M3, change here and document.)
- Parse `planCancelSchema`
- Call `cancelPlan`
- Map `PlanHasPaymentsError` → `{ ok: false, message: 'This plan has recorded payments. Reverse them before cancelling.' }`
- `revalidatePath('/plans')`; `revalidatePath('/plans/[id]', 'page')`; return `{ ok: true, data: { id } }`

**Tests (unit, mock service module):**
- Each action: not-signed-in path, forbidden-role path, validation failure path (assert `fieldErrors`), service-error mapping (`PropertyNotAvailableError`, `CustomerNotFoundError`, `PlanHasPaymentsError`), happy path returns `{ ok: true }`
- Verify `revalidatePath` is called with the expected paths

**Acceptance:**
- [ ] `pnpm -F web test server-actions/plans` passes
- [ ] Coverage on `apps/web/server-actions/plans/*.ts` ≥ 80%

---

## Task 4 — `<PlanForm />` (inline-everything client component)

**Files:**
- Create: `apps/web/components/plans/plan-form.tsx`
- Create: `apps/web/components/plans/customer-combobox.tsx`
- Create: `apps/web/components/plans/property-combobox.tsx`
- Create: `apps/web/components/plans/__tests__/plan-form.test.tsx`

**Layout (single screen, top to bottom):**
1. **Customer section** — radio toggle "Existing customer / New customer". When "Existing", show `<CustomerCombobox />` (typeahead by name/phone; calls a small RSC-fetched data endpoint or, simpler for M3, accepts the list as a prop from the page RSC). When "New", inline the fullName/phone/email/nationalId/notes fields. The combobox also has a `+ New customer` button that opens the existing `<CustomerCreateDialog />`; on success, the dialog closes and the new customer becomes the selected option in the combobox (passed via `onCreated` callback).
2. **Property section** — `<PropertyCombobox />` listing only AVAILABLE properties (filter applied in the page RSC). Same `+ New property` flow via existing `<PropertyCreateDialog />`. Show `code · address line 1 · ₦price` per option.
3. **Plan terms** — `totalPriceKobo` (free-form NGN), `depositKobo`, `monthlyKobo`, `termMonths` (6..36), `startDate` (date picker — plain `<input type="date">` is fine for M3, no calendar component).
4. **Deposit toggle** — rendered as a disabled `<Switch>` with helper text "Recording deposit at creation is available in M4." Form always submits `depositReceived: false`.
5. **Submit** — `Create plan` (creates DRAFT). Cancel link back to `/plans`.

**Form lib:** react-hook-form + `zodResolver(planCreateSchema)`. The discriminated-union customer field is wired by toggling `setValue('customer.mode', ...)` on the radio change. The disabled deposit switch sets the literal `false`.

**Submission:** `useActionState(createPlanAction, null)` (Next 16 pattern, same as M2 forms). On `{ ok: true }`: `router.push(/plans/${data.id})` and toast "Plan created". On `{ ok: false, fieldErrors }`: highlight via `setError`. On `{ ok: false, message }` without field errors: toast destructive.

**Tests (jsdom):**
- Renders with existing-customer mode selected by default
- Toggling to new-customer mode reveals the customer field group
- Deposit switch is disabled with the M4 hint visible
- Submitting with insufficient termMonths shows the field error from the resolver (no server call)
- Mock the action to assert it's called with the parsed payload on valid submit

**Acceptance:**
- [ ] Form renders in both customer modes
- [ ] Deposit switch is disabled and the hint is shown
- [ ] Vitest passes against the form's jsdom test
- [ ] Combobox `+ New` flow reuses the existing M2 dialogs verbatim (no fork)

---

## Task 5 — `/plans/new` page (RSC wrapper)

**Files:**
- Create: `apps/web/app/(authenticated)/plans/new/page.tsx`

**Responsibilities:**
- `await getTenantContext()` + `redirect('/login')` if null
- `hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])` else `redirect('/')`
- Fetch existing customers (`listCustomers(ctx, { q: undefined })` from `@solutio/db/customers-service`) and AVAILABLE properties (`listProperties(ctx, { status: 'AVAILABLE' })`).
- Render `<PlanForm customers={...} properties={...} />`

**Acceptance:**
- [ ] Page renders only for signed-in clerks; redirects on miss
- [ ] Combobox option lists are server-rendered (no client-side fetch)

---

## Task 6 — `/plans` list page

**Files:**
- Create: `apps/web/app/(authenticated)/plans/page.tsx`

**Responsibilities:**
- Auth gate + role gate (any signed-in role)
- Parse `searchParams.status` (default `ALL`) and `searchParams.q` through `planListFilterSchema`
- Call `listPlans(ctx, filter)`
- Render: page header ("Plans" + `<Link href="/plans/new"><Button>New plan</Button></Link>`), filter bar (status `<Select>` with `ALL/DRAFT/ACTIVE/COMPLETED/DEFAULTED/CANCELLED`, free-text `q` input that submits via form), `<Table>` with columns: Customer, Property code, Status (`<Badge variant=...>`), Total, Term, Created. Each row links to `/plans/[id]`.
- Empty state: "No plans yet. Create your first plan."

**Acceptance:**
- [ ] List paginates by status filter (no actual pagination in M3; show all rows ordered by createdAt desc — pagination is a future concern)
- [ ] Soft-deleted plans are excluded
- [ ] Status badges use distinct colors (DRAFT muted, ACTIVE primary, COMPLETED success, CANCELLED outline, DEFAULTED destructive)

---

## Task 7 — `/plans/[id]` detail page (tabbed)

**Files:**
- Create: `apps/web/app/(authenticated)/plans/[id]/page.tsx`
- Create: `apps/web/components/plans/installments-table.tsx`
- Create: `apps/web/components/plans/plan-cancel-button.tsx`
- Create: `apps/web/components/plans/__tests__/installments-table.test.tsx`

**Detail page layout:**
- Header: customer name · property code · status badge · "Created on …" · `<PlanCancelButton planId={...} status={plan.status} role={ctx.role} />`
- Plan terms strip: Total / Deposit / Monthly / Term / Start date — formatted via `formatKobo` and `formatDate`
- shadcn `<Tabs>` with three tabs:
  - **Installments** (default) — renders `<InstallmentsTable installments={plan.installments} />`
  - **Payments** — placeholder card: "Payments are recorded in M4." Disabled visual is fine.
  - **Actions** — placeholder card: "More actions in upcoming milestones." For M3 the cancel button lives in the header so this tab is mostly empty.

**`<InstallmentsTable />`:**
- Columns: # (sequenceNo), Due date, Amount due, Paid, Status, Balance
- Rows ordered by sequenceNo
- For M3 all rows are PENDING (no payments exist yet); balance = amountDueKobo
- Status badge with the same color rules as the list page

**`<PlanCancelButton />`:**
- Visible only if `status === 'DRAFT'` AND `role` is `OWNER` or `ADMIN`
- Opens `<Dialog>` with confirm copy: "Cancel this DRAFT plan? Installments will be marked alongside the plan. This action cannot be undone."
- On confirm, invokes `cancelPlanAction`
- Maps `{ ok: false }` to a toast; on `{ ok: true }` toasts success and `router.refresh()`

**Tests:**
- `installments-table.test.tsx`: renders rows in order, formats money via `formatKobo`, applies the right badge per status

**Acceptance:**
- [ ] Page loads for any signed-in role; 404 (`notFound()`) when the id misses or is in another tenant
- [ ] Installments tab renders the seq=0..N rows from `generateSchedule`
- [ ] Cancel button hidden for STAFF
- [ ] Cancel button hidden once status ≠ DRAFT

---

## Task 8 — Home + nav wiring

**Files:**
- Modify: `apps/web/app/(authenticated)/page.tsx` — add a third card linking to `/plans`
- Modify: `apps/web/components/site-nav.tsx` — add `Plans` link between Properties and the OWNER-gated Users link, with active-link highlighting

**Acceptance:**
- [ ] Home page shows three cards (Customers, Properties, Plans), each linking to its list
- [ ] Site nav highlights `Plans` when the path starts with `/plans`

---

## Task 9 — E2E lane

**Files:**
- Create: `apps/web/e2e/m3-plan-create.e2e.ts`

**Scenario:**
1. Login as STAFF clerk (seeded user from existing test fixture)
2. Create a customer via `/customers/new` (or pick existing seeded)
3. Create an AVAILABLE property via `/properties/new`
4. Navigate to `/plans/new`
5. Select existing customer + the new property
6. Enter terms: `totalPriceKobo=₦5,000,000`, `depositKobo=₦500,000`, `monthlyKobo=₦150,000`, `termMonths=24`, `startDate=today`
7. Submit
8. Land on `/plans/[id]`; assert: status badge says DRAFT; installments tab shows 25 rows (seq 0..24); seq 0 amount = ₦500,000; final row absorbs rounding (sums to ₦5,000,000 exactly)
9. From `/plans`, the new plan appears with status DRAFT; filter by `DRAFT` keeps it; filter by `ACTIVE` hides it
10. Login as OWNER; cancel the plan; assert status flips to CANCELLED; cancel button disappears

**Acceptance:**
- [ ] Playwright run green against a fresh DB
- [ ] No `console.error` during the run (assert via Playwright's `page.on('console', ...)`)

---

## Cross-cutting acceptance (M3 closeout)

- [ ] `pnpm -F @solutio/shared test`, `pnpm -F @solutio/db test`, `pnpm -F web test`, `pnpm -F web e2e` all green
- [ ] Vitest line coverage ≥ 80% across new code; ≥ 95% on `installments/schemas.ts`
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean; no new `ts-prune` unused exports
- [ ] `pnpm prisma:diff` clean against shadow DB (M3 ships zero schema changes — this verifies that)
- [ ] M2 closeout E2E lane still green (no regression)
- [ ] Squash-merge to `main` via PR; rms image rebuild + ArgoCD sync per the Phase 0 deploy pipeline

---

## Risks & mitigations specific to M3

| Risk | Mitigation |
|---|---|
| Discriminated-union customer field is awkward in formData | Reconstruct the union shape in the action before `.parse()`; tests cover both modes |
| Two clerks DRAFT-create against the same AVAILABLE property | M3 doesn't lock — both DRAFTs can coexist. The locking check fires on M4's ACTIVE transition. Document this in code comment on `createPlan` to prevent a future "looks like a bug" investigation. |
| Cancel button accidentally exposed to STAFF | Server action re-checks role; UI gate is defence-in-depth only |
| Combobox option lists get huge for big tenants | Out of scope for M3 — Atrium has <100 properties. Pagination is a Phase 2 concern. |
| `parseNgn` rejects user input with commas/spaces | Already tested at the M1 `parseNgn` unit; M3 schemas should `.transform` not `.refine` so the BigInt is what reaches the service |

---

## References

- Spec: `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md`
- M2 plan (precedent for structure + conventions): `docs/superpowers/plans/2026-05-15-phase-1a-m2-customer-property.md`
- Existing materialization fn: `packages/shared/src/installments/schedule.ts::generateSchedule`
- Existing dialog components (reuse verbatim): `apps/web/components/customers/customer-create-dialog.tsx`, `apps/web/components/properties/property-create-dialog.tsx`
- Service pattern reference: `packages/db/src/customers-service.ts`, `packages/db/src/payments-service.ts`
- Memory anchors: `feedback_no_js_suffix_in_shared_src`, `feedback_apps_web_imports_db_via_submodules`, `feedback_service_functions_own_prisma_internally`, `feedback_prisma_fortenant_needs_cast`, `feedback_server_actions_use_hasRole_not_requireRole`, `feedback_service_layer_explicit_ctx_param`, `feedback_partial_indexes_for_soft_delete`
