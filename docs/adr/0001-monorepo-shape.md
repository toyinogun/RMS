# ADR 0001 — Monorepo shape: Turborepo + Next.js monolith

**Status:** Accepted (2026-05-12)

## Context

Phase 0 has one customer (Atrium Homes) and no payment / webhook integrations
yet. A second deployable service in Phase 0 — a separate API or worker — would
double the deploy surface for zero current need. Future expansion (Phase 2
worker for Paystack webhooks and BullMQ jobs) is anticipated but additive.

## Decision

Single monorepo using **Turborepo + pnpm workspaces**. One deployable app:
`apps/web` — a Next.js 16.2 monolith using App Router with route handlers and
server actions for all backend behavior. Shared code lives in
`packages/{db,shared,config}`. Phase 2 worker enters as `apps/worker/`, a
sibling of `apps/web/`, requiring no edits to existing paths.

## Consequences

- One container image, one Deployment, one Ingress in Phase 0. Fast iteration.
- Server actions and route handlers run in the Node runtime — no Edge runtime
  fragility for DB-backed logic.
- Worker addition is additive; no restructure.
- Trade-off: Phase 0 forecloses on splitting the API into a separate service.
  The directory shape makes that split mechanical when justified.
