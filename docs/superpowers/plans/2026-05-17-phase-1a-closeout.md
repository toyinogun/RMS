# Phase 1a — Closeout Verification

**Date:** 2026-05-17
**Spec:** `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §"Cross-cutting acceptance for Phase 1a closeout"
**Decision recorded by:** Toyin

## Interpretation of the "deployed pod" gate

The spec says *"Phase 1a closes when M1–M7 are merged to main and the closeout E2E passes against a deployed pod."* That phrase has three plausible readings — see the closeout discussion in this session's plan for the trade-offs. We adopted the third reading:

> The CI Playwright run exercises the production-build artifact end-to-end (same `pnpm --filter @solutio/web start` entrypoint, same `apps/web/Dockerfile` `runner` target the cluster image is built from). The image digest produced by the M7 merge commit was promoted to the cluster in PR #12. The CI run on PR #11 therefore satisfies *"closeout E2E passes against the deployed artifact"*.

What that buys us: no second deploy lane to maintain, no staging DB to seed-and-tear-down each release. What we give up: we do not exercise the actual `solutio-prod` Service+Ingress+CNPG path post-rollout. That's an acceptable trade for Phase 1a (single-tenant, single-customer, pre-revenue). When Phase 1b adds multi-tenant invites and a second customer, revisit this.

## Evidence

| Gate | Result | Evidence |
|---|---|---|
| M1–M7 merged to `main` | ✅ | PRs #1 (M1, `22e076a`), #3 (M2, `ed84e81`), #5 (M3, `d8ea7c3`), #7 (M4, `58a192f`), #8 (M5, `1f57cb5`), #9 (M6, `c0ab1d4`), #11 (M7, `023e16d`) — all merged between 2026-05-15 and 2026-05-17 |
| Closeout E2E (login → customer+property → plan-with-deposit → payment → reversal → dashboard reflects net state) | ✅ | `apps/web/e2e/m4-m5-payments.e2e.ts` — single test "M5-A: OWNER reverses payment, plan COMPLETED → ACTIVE" runs the whole flow incl. dashboard assertions on lines 533–565 (stat cards, recent-activity table, reversal marker `↩`, negative-amount row, `View` aria-link) |
| Playwright E2E pass on the M7 merge | ✅ | PR [#11](https://github.com/toyinogun/RMS/pull/11) — `Playwright E2E: SUCCESS` (merge sha `023e16d`, 2026-05-17) |
| Image digest deployed | ✅ | `deploy/k8s/web/kustomization.yaml` pins `ghcr.io/toyinogun/rms@sha256:a62b1bc9…701` (M7), bumped in PR [#12](https://github.com/toyinogun/RMS/pull/12). `kubectl -n solutio-prod get pods -l app=solutio-web -o jsonpath='{.items[0].spec.containers[0].image}'` confirms the same digest is running. |
| Vitest line coverage ≥ 80% overall | ✅ | CI `Lint + typecheck + test` step in `.github/workflows/ci.yml:81` runs with `--coverage.thresholds.lines=80` (and functions/branches/statements). PR #11 passed this gate. |
| Vitest line coverage ≥ 95% on `@solutio/shared/installments` + `/payments` | ✅ | `pnpm --filter @solutio/shared test --coverage.enabled` shows **lines 99.32%**, functions 100%, statements 97.8%, branches 91.12% (162 tests / 14 files). |
| `prisma:diff` clean against shadow DB in CI | ✅ | `.github/workflows/ci.yml:76` — `pnpm --filter @solutio/db prisma:diff`. PR #11 passed. |
| TypeScript-strict, ESLint clean | ✅ | Covered by the `Lint + typecheck + test` job. PR #11 passed. |
| Pinning guards (image digests, GH actions SHAs) | ✅ | PR #11 — `Pinning guards: SUCCESS` |

## Gaps relative to the literal spec

These are minor — recorded here for honesty, not as blockers:

1. **`ts-prune` (unused exports)** is in the spec but is **not enforced in CI.** Phase 1a shipped without it. Add when convenient; current churn is low enough that it's not paying for itself yet.
2. **The 95% threshold on installments/payments** is **not enforced as a CI gate** — current coverage is well above the bar (99.32%) but a future regression would not block a PR. The 80% overall threshold *is* enforced. Adding a per-path threshold can wait until/unless we see drift.
3. **Post-rollout smoke against `solutio-prod` Service/Ingress/CNPG** is not automated — see "Interpretation" above. The two known infra follow-ups (`project_solutio_phase05_followups`) — ArgoCD Image Updater install + CNPG credential bootstrap — are independent of Phase 1a and remain queued.

## Outcome

**Phase 1a is closed.** M1–M7 shipped between 2026-05-15 and 2026-05-17. The deployed pod `solutio-web` in `solutio-prod` runs the M7 artifact. Next product work is Phase 1b (multi-tenant invites, RLS-on, multi-membership Better Auth). Next infra work, when convenient, is the Phase 0.5 follow-up pair.
