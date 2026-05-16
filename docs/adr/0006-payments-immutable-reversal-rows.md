# ADR 0006 — Payments immutable; corrections via reversing rows

**Status:** Implemented in M5 (2026-05-16) — see `docs/superpowers/plans/2026-05-16-phase-1a-m5-payment-reversal.md`. Accepted (2026-05-12).

## Context

Financial systems demand auditability. Editing a payment in place destroys
history and surprises accountants. We also want operators to be able to fix
mistakes without losing the original record.

## Decision

`Payment` rows are **immutable** after creation. To correct a Payment, a new
Payment row is inserted with:

- `amountKobo < 0` (negative — reversal),
- `reversedById` pointing at the original Payment,
- `PaymentAllocation` rows with negative amounts mirroring the original
  allocations.

The denormalized `Installment.amountPaidKobo` is updated by the reversal's
transaction, restoring the prior state.

## Consequences

- Full audit trail. `SELECT * FROM "Payment" WHERE planId = ?` is the full
  payment history.
- No `UPDATE` on Payment rows means easy WAL replication and easy backup
  diffing.
- Two-step correction (insert reversal, optionally insert replacement) is
  slightly more friction than an in-place edit, deliberately.
