# ADR 0002 — Row-level multi-tenancy

**Status:** Accepted (2026-05-12)

## Context

Solutio will eventually serve many real-estate companies. Atrium is the first
tenant. We need a tenancy model that supports a clean upgrade from "one tenant
in the DB" to "many tenants" without rewriting every query.

## Decision

Every business table carries `tenantId UUID NOT NULL`. Phase 0 has one tenant
row; Phase 1 enables the invite flow and Postgres RLS policies. Application-
layer enforcement lives in `forTenant(prisma, tenantId)` — a Prisma client
extension that auto-injects `tenantId` into reads and rejects cross-tenant
writes. Raw Prisma client access is ESLint-restricted to allow-listed paths.

## Consequences

- Adding tenant #2 requires no schema changes — only the invite UI and RLS
  policies.
- `forTenant()` is the only sanctioned data-access path; raw client usage is
  guarded by lint rules and code review.
- Trade-off: schema-per-tenant isolation is forfeited. Acceptable until
  enterprise compliance requirements appear.
