# ADR 0007 — Prisma multiSchema Preview flag: production-stable

**Status:** Accepted (2026-05-12)

## Context

Better Auth tables and domain tables live in different Postgres schemas
(`auth` vs `public`). Prisma's support for multiple schemas is behind a
`previewFeatures = ["multiSchema"]` flag.

## Decision

Enable `multiSchema` in `schema.prisma`. The Preview label concerns API
stability guarantees, not functional readiness — multiSchema has been
production-stable for over a year and is used in many production deployments.
We accept the (small) risk that a future Prisma minor version may shift the
generated client API and require corresponding refactors in our code.

## Consequences

- Clean schema separation between auth and domain tables.
- Coupled to Prisma's release rhythm for Preview-flag stabilization.
- Migration: when `multiSchema` graduates to GA, remove the flag line — no
  other change.
