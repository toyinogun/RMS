# ADR 0003 — Money as BigInt kobo

**Status:** Accepted (2026-05-12)

## Context

Property installments involve sums of money summed and allocated across
multiple rows. Float math loses precision. `Decimal` types require a runtime
library and add JSON-serialization friction.

## Decision

All monetary values are stored as Postgres `BIGINT` in **kobo** (NGN minor
units, 1 NGN = 100 kobo). In TypeScript: branded type `Kobo = bigint`. All
arithmetic is BigInt-native. Display formatting via `Intl.NumberFormat` in
`packages/shared/money/`.

Reversal payments use negative `BigInt` values.

## Consequences

- No precision loss across any sequence of additions, subtractions, or
  allocations.
- Tenant currency stored on `Tenant.currency` (defaults `'NGN'`) — future
  multi-currency tenants pin their unit semantics at the tenant level.
- Trade-off: JSON serialization of `BigInt` requires explicit handling
  (`.toString()` on egress). The `formatKobo` helper handles the display case.
