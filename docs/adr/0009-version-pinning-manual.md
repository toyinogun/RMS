# ADR 0009 — Manual version pinning; no Renovate / Dependabot

**Status:** Accepted (2026-05-12)

## Context

Automated dependency-update bots open many PRs per week, each requiring a
human "is this safe?" judgment. Our pinning philosophy is exact versions
everywhere — caret-/tilde-free `package.json`, lockfile committed, Docker
bases by SHA digest, GitHub Actions by SHA. Auto-bumping defeats the intent
of pinning by creating constant churn.

## Decision

**No automated dependency tooling.** No `renovate.json`. No
`.github/dependabot.yml`. Updates are deliberate: a human reviews release
notes, runs the verification command (`npm view <pkg> version`, `crane digest
<image>`), edits exact versions, regenerates the lockfile, opens a PR.

CI grep guards enforce the rule: caret/tilde in `package.json`, unpinned
`FROM` in any Dockerfile, or unpinned `uses:` in any workflow fails the build.

## Consequences

- Zero PR noise from update bots.
- Updates lag behind upstream until a human deliberately bumps.
- If a critical CVE lands, the human path is "open `verify-versions.sh`,
  bump, regenerate, PR" — no different from any other update.
