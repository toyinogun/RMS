# ADR 0005 — Better Auth in `auth` schema; domain User joins on `authUserId`

**Status:** Accepted (2026-05-12)

## Context

Better Auth ships its own tables (`user`, `session`, `account`, `verification`).
We also need a tenant-scoped domain `User` with role, name, and the
`mustChangePassword` flag. The two universes are distinct concepts:
credential identity vs. business identity.

## Decision

Better Auth tables live in the **`auth` Postgres schema** via Prisma's
`multiSchema` Preview feature. Domain `User` lives in `public.User` and
references Better Auth's `auth.user.id` via the **`authUserId` column** —
**never email**. Email is stored on the domain User as denormalized display
state; the stable join key is the immutable auth user id.

In Phase 0 the domain User table also has `@@unique([authUserId])` (one
tenant per auth user). Phase 1 drops that constraint when multi-tenant
memberships land; the tenant-scoped `@@unique([tenantId, authUserId])` already
supports that future.

## Consequences

- Email changes do not break login lookups.
- Better Auth's API surface is unchanged — domain logic operates on the
  tenant-scoped `User`.
- The Prisma multiSchema Preview flag is required. Its stability is well-
  established (>1 year in production deployments); the Preview label refers to
  API stability guarantees, not functional readiness.
- The `auth` schema must be created before the first Prisma migration runs.
  Both `CNPG postInitSQL` and the `0000_init_schemas` migration provide this.
