# Phase 1a — Product UI on current tenancy

**Date:** 2026-05-15
**Status:** Approved — ready for implementation planning
**Builds on:** Phase 0 (commit `18965a2`)
**Defers to:** Phase 1b (multi-tenant invites, RLS-on, multi-membership Better Auth)

## Purpose

Ship the four customer-facing screens — Customer, Property, Plan, Payment — on top of the data model and tenancy already in place, so Atrium Homes can stop running their installments business out of Excel.

Phase 0 delivered the foundation (monorepo, schema, deploy pipeline). Phase 1a delivers the product the clerk actually uses. Phase 1b will harden tenancy before a second customer onboards.

## Scope

### In scope
- **Customer:** list (with search), create, edit, soft-delete, detail with plans tab
- **Property:** list (with status filter), create, edit, soft-delete, manual status transitions, detail
- **Plan:** inline-everything create flow (customer + property + terms + optional deposit), detail with installments / payments / actions tabs, cancel
- **Payment:** record against a plan with auto-FIFO allocation + manual override, view detail, post reversals (OWNER/ADMIN)
- **Users:** OWNER-only screen to add ADMIN/STAFF users with auto-generated temp password (no email invites); deactivate
- **Home dashboard:** today's payments total, overdue installments count, active plans count, recent activity list

### Out of scope (explicit non-goals)
- Email-based invites and accept-link flow (Phase 1b)
- RLS policies at DB level (Phase 1b)
- Multi-tenant membership model (Phase 1b)
- Excel import / historical back-fill (later)
- Paystack, WhatsApp, Mono integrations (Phase 2)
- Customer-facing portal (later, if ever)
- Reports / exports / analytics (later)
- Late-fee automation, overdue notifications (later)
- Property reservation expiry timers (later)
- Audit log table — `createdBy` columns are the only trail in 1a

## Locked design decisions

These were resolved during the 2026-05-15 brainstorming session. They are binding for the spec and the plan.

| # | Decision | Rationale |
|---|---|---|
| 1 | MVP flow = new-sale | Atrium needs to record sales as they come, not back-fill Excel. |
| 2 | OWNER user-management screen (no email invites yet) | Atrium clerks need real accounts to ship 1a without waiting on 1b's invite flow. |
| 3 | Plan create = inline-everything (option A) | Dominant case is new-customer + existing-property; single screen is fastest. "Pick existing customer" handles repeats. |
| 4 | Single-action plan create with "Deposit received now?" toggle | Cash usually changes hands at the counter; one transaction (plan + deposit Payment + ACTIVE flip + Property → SOLD) handles it. DRAFT supported for pre-quote case. |
| 5 | Payment allocation = auto-FIFO with manual override | Default covers 90% of cases automatically; override is available for the lump-sum-skip-installment exception. |
| 6 | Full reversal UI, anyone with OWNER/ADMIN role can post | Cheques bounce; Atrium hits this in week one. |
| 7 | Plan cancel blocked if any Payment exists; reverse first | Keeps state invariant simple: cancelled plans always have zero recorded receipts. |
| 8 | Property auto-flip AVAILABLE → SOLD on plan ACTIVE; RESERVED stays manual | SOLD is a side-effect of selling; RESERVED is a holding action not driven by plan state. |
| 9 | Users page OWNER-only in 1a | ADMIN gets users management in 1b along with invite flow. |
| 10 | shadcn/ui (copy-paste) for primitives | Buttons/dialog/table/toast not worth reinventing. Doesn't violate version-pinning rule because components live in our repo. |
| 11 | Plan detail = single page with tabs (Installments / Payments / Actions) | One coherent view of the plan beats route fan-out. |
| 12 | `Payment.reversesPaymentId` column (not a `PaymentReversal` table) | Reversals are whole-payment only; the column with a unique constraint is simpler and prevents double-reversal at the DB level. |
| 13 | Property concurrency = re-read-and-abort inside transaction | Two-clerks-same-property is rare at Atrium scale. Refresh-and-retry friendly error is good enough; `SELECT ... FOR UPDATE` not warranted. |
| 14 | No audit_log table in 1a | `createdBy` columns are sufficient. Revisit if Atrium asks. |

## Architecture

### File layout additions

```
apps/web/
├── app/(authenticated)/
│   ├── page.tsx                      [home dashboard]
│   ├── customers/
│   │   ├── page.tsx                  [list + search]
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx             [detail w/ plans tab]
│   ├── properties/
│   │   ├── page.tsx                  [list + status filter]
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── plans/
│   │   ├── page.tsx                  [list + status filter]
│   │   ├── new/page.tsx              [inline-everything form]
│   │   └── [id]/page.tsx             [tabbed detail]
│   ├── payments/
│   │   ├── new/page.tsx              [pre-fills planId via query param]
│   │   └── [id]/page.tsx             [detail w/ Reverse action]
│   └── users/
│       ├── page.tsx                  [OWNER-only, enforced in layout RSC]
│       ├── new/page.tsx
│       └── layout.tsx                [OWNER gate]
└── server-actions/
    ├── customers/ {create, update, softDelete}.ts
    ├── properties/ {create, update, softDelete, setStatus}.ts
    ├── plans/ {create, cancel}.ts          [create handles deposit toggle]
    ├── payments/ {record, reverse}.ts
    └── users/ {create, deactivate}.ts

packages/shared/src/
├── installments/
│   ├── materialize.ts                [pure: terms → Installment[] incl seq=0 deposit]
│   ├── allocate.ts                   [pure: amountKobo + installments → PaymentAllocation[]]
│   └── schemas.ts                    [Zod schemas for plan terms]
├── payments/
│   ├── reverse.ts                    [pure: original payment + allocations → reversing rows]
│   └── schemas.ts
├── money/
│   ├── format.ts                     [formatKobo(BigInt) → "₦833,333.00"]
│   └── parse.ts                      [parseNgn("833,333") → BigInt]
├── customers/schemas.ts
├── properties/schemas.ts
└── users/schemas.ts
```

### Where business logic lives

- **Pure functions** in `@solutio/shared/<domain>/`: math, validation, allocation, materialization, reversal. No I/O. Take all inputs as explicit args — no ambient ctx resolution (per locked feedback memory).
- **Server actions** in `apps/web/server-actions/<domain>/`: the boundary. They (a) resolve `ctx` (tenantId, userId, role) from the session, (b) `schema.parse(input)`, (c) open a Prisma transaction via `forTenant(ctx.tenantId)`, (d) call shared pure functions to compute, (e) write rows, (f) `revalidatePath`.
- **Forbidden:** importing or calling ambient ctx resolvers from inside `@solutio/shared/*`. Only boundaries resolve ctx.

### Data access patterns

- Mutations always go through `forTenant(tenantId).$transaction([...])` (existing extension). Writes use the `satisfies` + `unknown` cast pattern documented in `feedback_prisma_fortenant_needs_cast`.
- Reads in server components query directly through `forTenant()` — no separate read API layer.
- Imports from `@solutio/db` use submodule paths (`@solutio/db/client`, `@solutio/db/tenant-client`), never the barrel (per locked feedback memory).

### Authorization

- Session enforcement lives in `app/(authenticated)/layout.tsx` (RSC layout, per locked feedback memory — never middleware).
- Role gating for `/users/*` lives in `app/(authenticated)/users/layout.tsx`. Redirects non-OWNER to `/`.
- Server actions re-check role server-side — never trust the client gate alone.
- Soft-deleted rows are hidden from all lists. Users with `deactivatedAt` cannot sign in.

## Component approach

- **shadcn/ui** for primitives: `Button`, `Input`, `Select`, `Combobox`, `Dialog`, `Table`, `Tabs`, `Toast`, `Badge`, `Form` wrappers. Copy-paste, live in the repo, no new versioned dependency.
- **react-hook-form + @hookform/resolvers/zod** for all forms. Same Zod schema validates client-side and server-side.
- **Money input**: custom `<MoneyInput>` component wrapping `Input` — accepts formatted string, internal state is kobo BigInt, emits BigInt on submit.

## Data flow per action

### Create plan (the central transaction)

Inside `forTenant(tenantId).$transaction([...])`:
1. If `customer` is "+ new": `customer.create`.
2. `plan.create` with `status: depositReceived ? ACTIVE : DRAFT`.
3. `installment.createMany` for `seq=0..termMonths` using `materialize()` pure fn output.
4. If `depositReceived`: `payment.create` + `paymentAllocation.create` against the `seq=0` installment for the deposit amount.
5. If plan is now ACTIVE: re-fetch property inside the transaction; if status ≠ AVAILABLE, abort the whole transaction with `PropertyNoLongerAvailableError`. Otherwise `property.update` → SOLD.
6. `installment.update` for seq=0 if deposit recorded: `amountPaidKobo` + status PAID.

On rollback, the clerk sees one error toast. Nothing partial persists.

### Record payment

Inside transaction:
1. `payment.create`.
2. Compute allocations via `allocate()` pure fn (or use the clerk's manual override if provided). Validate sum equals payment amount.
3. `paymentAllocation.createMany`.
4. For each touched installment: `installment.update` setting `amountPaidKobo` and recomputed `status` (PAID if paid ≥ due; PARTIAL otherwise; PENDING if zero).
5. If all installments PAID after this payment → `plan.update` → COMPLETED.

### Reverse payment

Inside transaction:
1. `payment.create` with negative amount + `reversesPaymentId = original.id`. Unique constraint on `reversesPaymentId` prevents double-reversal.
2. `paymentAllocation.createMany` mirroring original allocations with negated `amountKobo`.
3. For each affected installment: decrement `amountPaidKobo`, recompute status.
4. If the original payment closed the plan, the plan must transition back to ACTIVE.

## Schema additions

Only two new columns and one unique constraint:

```prisma
model Payment {
  // existing fields…
  reversesPaymentId String? @db.Uuid

  reverses Payment? @relation("PaymentReversal", fields: [reversesPaymentId], references: [id])
  reversedBy Payment? @relation("PaymentReversal")

  @@unique([reversesPaymentId])  // prevent double-reversal
}

model User {
  // existing fields…
  deactivatedAt DateTime?
}
```

Migration goes through the existing Pre-Sync Job pipeline (Phase 0 AC verified).

## Validation strategy

- **Zod schemas** are defined in `@solutio/shared/<domain>/schemas.ts`, imported by both the form (via `zodResolver`) and the server action (via `parse`).
- **Database constraints** catch what schemas can't:
  - `(tenantId, code)` unique on Property
  - `(planId, sequenceNo)` unique on Installment
  - `(tenantId, authUserId)` unique on User
  - `reversesPaymentId` unique on Payment
- `Prisma.PrismaClientKnownRequestError` codes mapped to user-friendly errors (e.g. P2002 unique-violation on property code → "Property code already in use").
- **Server-action return shape:** `{ ok: true, data } | { ok: false, message, fieldErrors? }`. Rendered as toast + form field highlights.

## Concurrency

- **Property race** (two clerks creating plans against the same AVAILABLE property): re-read inside the transaction, abort with `PropertyNoLongerAvailableError` if not AVAILABLE. The second clerk sees a refresh-and-retry error.
- **Double-reversal**: prevented by `@@unique([reversesPaymentId])` at the DB.
- **Concurrent payment recording on the same plan**: no race here — each Payment is independent, allocations are computed from the latest installment state inside the transaction.

## Build sequencing — milestones

Each milestone is independently shippable. Atrium can start using earlier milestones before later ones land.

### M1 · Foundation
- shadcn/ui + Toaster wired into `(authenticated)/layout.tsx`
- `formatKobo` / `parseNgn` helpers in `@solutio/shared/money`
- Schema migration: `Payment.reversesPaymentId` + `User.deactivatedAt` + the unique constraint
- Top nav: Home · Customers · Properties · Plans · Users · sign-out

**Acceptance**
- Nav renders with active-link highlighting
- Money helpers unit-tested ≥ 95% line coverage; round-trip `parseNgn(formatKobo(x)) === x` for representative values
- Migration applied in CI shadow DB (existing `prisma:diff` check stays green)
- Migration applied in prod via existing Pre-Sync Job

### M2 · Customer & Property CRUD
- Customer list / new / detail / edit / soft-delete
- Property list / new / detail / edit / status set (manual) / soft-delete
- Reusable inline-`+ New customer` Dialog component (consumed by M3 plan-create)
- Reusable inline-`+ New property` Dialog component

**Acceptance**
- Clerk can create, edit, soft-delete a customer; soft-deleted customer disappears from list and from "Pick existing customer" combobox in plan-create
- Same for property
- Partial-index plans verified in EXPLAIN ANALYZE on the list queries (per locked anchor)
- Vitest coverage ≥ 80% across server actions; ≥ 95% on shared schemas

### M3 · Plan create + materialization
- `materialize()` pure fn in `@solutio/shared/installments` + unit tests (deposit-only, equal months, last-installment-absorbs-rounding)
- Plan list page
- Plan create page with the inline-everything layout from Section 3 of the design
- Plan detail with Installments tab only (Payments tab placeholder until M4)
- Property auto-flip AVAILABLE → SOLD when plan ACTIVE
- Plan cancel server action (blocked if any Payment exists)

**Acceptance**
- Clerk creates plan with new customer + existing AVAILABLE property + deposit toggle off → DRAFT plan with `seq=0..N` installments; property stays AVAILABLE
- Deposit toggle is **disabled** in M3 with a hint "Available in M4"; M3 cannot transition a plan to ACTIVE
- Cancel works on DRAFT plans; not applicable to ACTIVE plans in M3 (no Payments exist yet)

### M4 · Payment record + auto-FIFO allocation
- `allocate()` pure fn in `@solutio/shared/payments` + unit tests (exact match, underpay → PARTIAL, overpay → roll forward, lump-sum-spans-multiple, exact-completion → PAID)
- Payment record form with live FIFO preview + manual override + unallocated-must-equal-zero guard
- Plan-create deposit toggle enabled (uses same payment path inside the create transaction)
- Plan detail Payments tab + Installments tab show synchronized state
- Plan → COMPLETED when last installment PAID

**Acceptance**
- Clerk records payment of various sizes; FIFO preview correct; manual override works; submit disabled when allocations don't sum to amount
- Installment statuses transition correctly (PENDING → PARTIAL → PAID)
- Plan completes when all installments PAID
- Property race test: two concurrent plan-create attempts on same property — first succeeds, second aborts with friendly error

### M5 · Payment reversal
- `reverse()` pure fn in `@solutio/shared/payments` + unit tests
- Reverse action on Payment detail with confirmation Dialog explaining consequences
- Idempotency enforced by unique constraint on `reversesPaymentId`
- Original Payment shows "Reversed by …" badge; reversal Payment shows "Reversal of …" badge
- Completed plan transitions back to ACTIVE when a closing payment is reversed

**Acceptance**
- OWNER/ADMIN reverses a payment; installments revert; balance restored; both badges appear
- STAFF does not see Reverse button
- Cannot reverse an already-reversed payment

### M6 · Users management
- Users list / new (auto-generate temp password, copy-to-clipboard button) / deactivate / re-activate
- OWNER-only gate enforced in `app/(authenticated)/users/layout.tsx`
- New user marked `mustChangePassword=true` — existing onboarding flow handles first login
- Deactivated user cannot sign in (mechanism: server action drops their `auth.session` rows and a sign-in hook rejects users with `deactivatedAt IS NOT NULL`; exact wiring decided during M6 implementation)

**Acceptance**
- OWNER creates STAFF user; copies temp password; signs out; signs in as STAFF; forced through onboarding; lands on dashboard with no Users tab visible
- OWNER deactivates STAFF; STAFF cannot sign in
- OWNER re-activates; STAFF can sign in again

### M7 · Home dashboard polish
- Replace welcome text with: 3 stat cards (today's payments total, overdue installments count, active plans count) + recent activity table (last 10 Payments incl. reversals as separate rows)
- "Overdue" = installment with `status != PAID` and `dueDate < now()`

**Acceptance**
- Stat counts match SQL-verified ground truth
- Today's-payments total = sum of `Payment.amountKobo` where `paidOn = today`, including the negative reversal amounts (i.e., the net for the day)
- Recent activity links to Payment detail

## Cross-cutting acceptance for Phase 1a closeout

- Vitest line coverage ≥ 80% overall
- Vitest line coverage ≥ 95% on `@solutio/shared/installments` and `@solutio/shared/payments`
- One Playwright E2E covering: login → create customer + property → create plan with deposit → record monthly payment → reverse it → verify dashboard reflects net state
- `prisma:diff` clean against shadow DB in CI
- No TypeScript-strict errors, no ESLint errors, no unused exports (ts-prune)
- Phase 1a closes when M1–M7 are merged to main and the closeout E2E passes against a deployed pod

## Testing layers

- **Unit (Vitest)**: every pure function in `@solutio/shared/*`. Property-based-ish coverage for `materialize` and `allocate` (random valid inputs, assert invariants: sum-of-installments + deposit == total, sum-of-allocations == payment).
- **Integration (Vitest + real Postgres via testcontainers — already wired)**: each server action against a fresh DB, asserting transactional invariants. Happy path + 2-3 edge cases per action.
- **E2E (Playwright — already wired)**: the closeout flow listed above. Runs on PRs targeting `main` only (per locked anchor — not every push).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Money rounding off-by-kobo across installments | `materialize()` distributes remainder to the last installment; unit tests enforce sum invariant |
| Allocation override produces sum ≠ payment amount | Submit button disabled until `sum(allocations) == amount`; server re-validates |
| Two clerks create plan against same property | Re-read property inside transaction; abort with friendly error if not AVAILABLE |
| Reversal applied to plan that already auto-completed | Transaction transitions plan back to ACTIVE |
| OWNER deactivates themselves | Server action blocks `targetUserId == ctx.userId`; OWNER must have another OWNER deactivate them (or stays an open question — flagged below) |
| Test DB drift from prod schema | CI runs `prisma migrate diff` against shadow DB (Phase 0 AC #4) |

## Open questions to revisit

These don't block the implementation plan but need answers before specific milestones:

1. **OWNER self-deactivation**: blocked entirely, or allowed with confirmation when ≥1 other OWNER exists? Resolve before M6.
2. **Plan terms edit**: do we allow editing `totalPriceKobo` / `depositKobo` / `monthlyKobo` / `termMonths` while plan is DRAFT, or is plan immutable once created and the only way to "edit" is cancel + recreate? Resolve before M3.
3. **Deactivated user with active sessions**: do we revoke their existing Sessions, or wait for natural expiry? Resolve before M6.

## Out-of-scope follow-ups noted during design

- Audit log table — only useful if Atrium asks; otherwise `createdBy` is enough
- Structured server-side logging — currently `console.error`; revisit when observability is set up
- PgBouncer (CNPG pooler) — Phase 2 per locked anchors
- The two Phase 0.5 follow-ups remain in `~/.claude/projects/-Users-toyinogunseinde-RMS/memory/project_solutio_phase05_followups.md` and are independent of Phase 1a — pick them up when convenient.

## References

- Phase 0 locked anchors: `project_solutio_phase0_anchors` memory
- Phase 0.5 follow-ups: `project_solutio_phase05_followups` memory
- Better Auth join rule: `feedback_better_auth_join_on_user_id_not_email` memory
- Partial indexes for soft delete: `feedback_partial_indexes_for_soft_delete` memory
- Shared package organization by domain: `feedback_shared_packages_organize_by_domain` memory
- Explicit `ctx` param at boundaries: `feedback_service_layer_explicit_ctx_param` memory
- RSC layout gate (not middleware): `feedback_nextjs_enforce_in_rsc_layout_not_middleware` memory
- `apps/web` imports `@solutio/db` via submodule paths: `feedback_apps_web_imports_db_via_submodules` memory
- `forTenant()` write cast pattern: `feedback_prisma_fortenant_needs_cast` memory
- Manual deps only, no Renovate: `feedback_no_renovate_or_automated_dep_updates` memory
