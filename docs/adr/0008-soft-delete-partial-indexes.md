# ADR 0008 — Soft delete via partial indexes

**Status:** Accepted (2026-05-12)

## Context

`Customer`, `Property`, and `Plan` use a `deletedAt` column for soft delete.
Most queries filter `WHERE "deletedAt" IS NULL`. A composite index on
`(tenantId, deletedAt)` would pay for every soft-deleted row forever even
though those rows are never accessed through that index.

## Decision

Use **partial indexes** for the hot path on active rows:

```sql
CREATE INDEX customer_active_idx ON "Customer"("tenantId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX property_active_idx ON "Property"("tenantId", "status")
  WHERE "deletedAt" IS NULL;

CREATE INDEX plan_active_idx ON "Plan"("tenantId", "status")
  WHERE "deletedAt" IS NULL;
```

Plus one DB-enforced uniqueness invariant:

```sql
CREATE UNIQUE INDEX plan_one_active_per_property
  ON "Plan"("tenantId", "propertyId")
  WHERE "status" IN ('ACTIVE', 'COMPLETED') AND "deletedAt" IS NULL;
```

Raw SQL is appended to the initial Prisma migration; Prisma does not yet
support partial indexes via `@@index`.

## Consequences

- Smaller index, faster scans for the 99% query path.
- Partial-index syntax requires raw-SQL migration maintenance.
- Postgres uses partial indexes automatically when query predicates match.
