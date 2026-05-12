# Solutio Installments — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Solutio Installments monorepo with a tenant-aware Prisma data model, Better Auth login, force-password-change flow, and ArgoCD-driven deploy to k3s — meeting all nine acceptance criteria in the design spec.

**Architecture:** Turborepo monorepo. Single Next.js 16.2 monolith (`apps/web`) using App Router with route handlers and server actions. Shared code in `packages/{db,shared,config}` organized by domain. Row-level multi-tenancy via `tenant_id` columns enforced by a `forTenant()` Prisma client extension. Better Auth in its own `auth.*` Postgres schema; domain `User` table joins on `authUserId`. Single ArgoCD root Application points at `deploy/argocd/apps/` (app-of-apps) with sync waves for CNPG → Sealed Secrets → web. GitHub Actions builds and pushes to `repo.toyintest.org`; ArgoCD Image Updater watches digests and writes them back to `deploy/k8s/web/kustomization.yaml`.

**Tech Stack:** Next.js 16.2.x, Node 24 LTS, pnpm + Turborepo, Prisma + PostgreSQL 18.3 (via CloudNativePG), Better Auth, Zod, Vitest, Playwright, Testcontainers, ArgoCD, Sealed Secrets, GitHub Actions, Bash/Kustomize.

**Spec reference:** `docs/superpowers/specs/2026-05-12-solutio-phase0-design.md`

---

## File structure (locked at plan time)

```
solutio/                                          # repo root, CWD = /Users/toyinogunseinde/RMS
├── .github/workflows/
│   ├── ci.yml                                    # PR + push CI
│   └── release.yml                               # push-to-main image build
├── .gitignore
├── .npmrc                                        # save-exact=true
├── .nvmrc                                        # Node 24.x exact patch
├── .tool-versions                                # kubeseal, pnpm, node
├── README.md
├── apps/
│   └── web/
│       ├── Dockerfile                            # multi-stage, distroless, non-root
│       ├── app/
│       │   ├── (authenticated)/
│       │   │   ├── layout.tsx                    # mustChangePassword gate
│       │   │   └── page.tsx                      # home
│       │   ├── (onboarding)/
│       │   │   ├── layout.tsx                    # exempt from gate
│       │   │   └── change-password/page.tsx
│       │   ├── api/
│       │   │   ├── auth/[...all]/route.ts        # Better Auth handler
│       │   │   └── health/route.ts
│       │   ├── login/page.tsx
│       │   ├── layout.tsx                        # root layout
│       │   └── globals.css
│       ├── e2e/happy-path.spec.ts
│       ├── lib/
│       │   ├── auth.ts                           # Better Auth instance
│       │   └── tenant-context.ts                 # getTenantContext()
│       ├── next.config.ts
│       ├── package.json
│       ├── playwright.config.ts
│       ├── postcss.config.js
│       ├── server-actions/
│       │   └── change-password.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vitest.config.ts
├── deploy/
│   ├── argocd/
│   │   ├── root-app.yaml
│   │   └── apps/
│   │       ├── cnpg-cluster.yaml
│   │       ├── solutio-secrets.yaml
│   │       └── solutio-web.yaml
│   └── k8s/
│       ├── cnpg/
│       │   ├── cluster.yaml
│       │   └── kustomization.yaml
│       ├── secrets/
│       │   ├── kustomization.yaml
│       │   ├── solutio-auth.sealedsecret.yaml
│       │   ├── solutio-db.sealedsecret.yaml
│       │   └── solutio-seed.sealedsecret.yaml
│       └── web/
│           ├── deployment.yaml
│           ├── hpa.yaml
│           ├── ingress.yaml
│           ├── kustomization.yaml
│           └── service.yaml
├── docs/
│   ├── adr/
│   │   ├── 0001-monorepo-shape.md
│   │   ├── 0002-tenancy-row-level.md
│   │   ├── 0003-money-bigint-kobo.md
│   │   ├── 0004-ids-uuid-v7-native-pg18.md
│   │   ├── 0005-better-auth-separate-tables.md
│   │   ├── 0006-payments-immutable-reversal-rows.md
│   │   ├── 0007-prisma-multischema-preview-flag.md
│   │   ├── 0008-soft-delete-partial-indexes.md
│   │   ├── 0009-version-pinning-manual.md
│   │   └── 0010-deploy-app-of-apps-monorepo.md
│   ├── superpowers/
│   │   ├── plans/2026-05-12-solutio-phase0.md   # this file
│   │   └── specs/2026-05-12-solutio-phase0-design.md
│   └── README.md
├── package.json                                  # root
├── packages/
│   ├── config/
│   │   ├── eslint/index.js                       # base + restricted-imports rule
│   │   ├── package.json
│   │   ├── prettier/index.js
│   │   └── tsconfig/base.json
│   ├── db/
│   │   ├── __tests__/
│   │   │   ├── drift-amountpaid.integration.test.ts
│   │   │   ├── seed-idempotent.integration.test.ts
│   │   │   ├── partial-indexes.integration.test.ts
│   │   │   └── tenant-client.integration.test.ts
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   │   ├── 0000_init_schemas/migration.sql
│   │   │   │   └── 0001_phase0_schema/migration.sql
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   ├── client.ts                         # raw client export
│   │   │   ├── index.ts
│   │   │   ├── seed.ts
│   │   │   └── tenant-client.ts                  # forTenant()
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── shared/
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── installments/
│       │   │   ├── __tests__/schedule.test.ts
│       │   │   ├── __tests__/status.test.ts
│       │   │   ├── index.ts
│       │   │   ├── schedule.ts
│       │   │   ├── status.ts
│       │   │   └── types.ts
│       │   ├── money/
│       │   │   ├── __tests__/kobo.test.ts
│       │   │   ├── index.ts
│       │   │   ├── kobo.ts
│       │   │   └── types.ts
│       │   ├── payments/
│       │   │   ├── __tests__/allocate.test.ts
│       │   │   ├── allocate.ts
│       │   │   ├── index.ts
│       │   │   └── types.ts
│       │   └── tenant/
│       │       ├── __tests__/role.test.ts
│       │       ├── context.ts
│       │       ├── index.ts
│       │       └── role.ts
│       ├── tsconfig.json
│       └── vitest.config.ts
├── pnpm-lock.yaml                                # committed
├── pnpm-workspace.yaml
├── scripts/
│   ├── check-no-caret.sh                         # CI grep guards
│   ├── check-no-unpinned-from.sh
│   ├── check-no-unpinned-uses.sh
│   ├── check-no-unsealed-secret.sh
│   └── verify-versions.sh                        # one-shot scaffold helper
├── turbo.json
└── vitest.workspace.ts
```

---

## Version verification — run before any pinning task

Each pin task below assumes you've run the corresponding verify command and have the value in hand. The plan uses **`<NODE_VERSION>`**, **`<NEXT_VERSION>`**, etc. — replace with the literal value from the verify output. **Never paste a `^` or `~` prefix.**

Commands (run once, capture output to a scratchpad you keep open):

```bash
npm view node --json 2>/dev/null | jq -r '.version'             # latest published node tag — but use LTS:
curl -s https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts != false)] | .[0].version' | sed 's/^v//'
npm view pnpm version
npm view next version
npm view typescript version
npm view prisma version
npm view @prisma/client version
npm view zod version
npm view vitest version
npm view @playwright/test version
npm view better-auth version
npm view tailwindcss version
npm view react version
npm view react-dom version
npm view @types/node version
npm view @types/react version
npm view @types/react-dom version
npm view turbo version
npm view eslint version
npm view prettier version
npm view tsx version
npm view testcontainers version
npm view @testcontainers/postgresql version

# Docker base image digests (need crane installed: brew install crane)
crane digest "node:<NODE_VERSION>-bookworm-slim"
crane digest "gcr.io/distroless/nodejs24-debian12:latest"
crane digest "ghcr.io/cloudnative-pg/postgresql:18.3-bookworm"
crane digest "postgres:18.3-bookworm"                            # for testcontainers
```

Capture all values in `scripts/verify-versions.sh` (Task 7) so the team can re-run.

---

## Conventions every task follows

- **TDD per the global rule.** RED → GREEN → REFACTOR. Tests are committed before or with the implementation that satisfies them.
- **One logical change per commit.** Commit messages use conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`, `ci:`).
- **All commands run from `/Users/toyinogunseinde/RMS`** unless explicitly stated.
- **No `^` or `~`** in any `package.json`.
- **No unpinned `FROM` in Dockerfiles, no unpinned `uses:` in workflows.** Grep guards exist; respect them.
- **All code is TypeScript strict mode.** `noUncheckedIndexedAccess: true`.
- **All Prisma writes that touch business tables go through `forTenant()`** — never the raw client.

---

## Task index

| # | Phase | Task |
|---|---|---|
| 1 | A. Scaffold | git init, .gitignore, README skeleton |
| 2 | A. Scaffold | .nvmrc, .npmrc, .tool-versions |
| 3 | A. Scaffold | Root package.json + pnpm-workspace.yaml + turbo.json |
| 4 | A. Scaffold | packages/config — tsconfig, eslint, prettier |
| 5 | A. Scaffold | Vitest workspace config |
| 6 | A. Scaffold | CI grep-guard scripts |
| 7 | A. Scaffold | verify-versions.sh |
| 8 | A. Scaffold | Initial commit |
| 9 | B. Data | packages/db scaffold + Prisma init |
| 10 | B. Data | Bootstrap migration: CREATE SCHEMA auth |
| 11 | B. Data | Prisma schema — Tenant, User, enums |
| 12 | B. Data | Prisma schema — Customer, Property |
| 13 | B. Data | Prisma schema — Plan, Installment |
| 14 | B. Data | Prisma schema — Payment, PaymentAllocation |
| 15 | B. Data | Raw-SQL partial indexes |
| 16 | B. Data | forTenant() client extension + tests |
| 17 | B. Data | Seed script |
| 18 | C. Domain | money/ — kobo helpers + tests |
| 19 | C. Domain | installments/ — schedule generation + tests |
| 20 | C. Domain | installments/ — status derivation + tests |
| 21 | C. Domain | payments/ — allocation logic + tests |
| 22 | C. Domain | tenant/ — TenantContext type + role helpers + tests |
| 23 | C. Domain | Drift integration test for amountPaidKobo |
| 24 | D. Auth | apps/web scaffold (Next.js init pinned) |
| 25 | D. Auth | Better Auth wiring with multiSchema |
| 26 | D. Auth | Auth route handler + login page |
| 27 | D. Auth | getTenantContext() in apps/web/lib |
| 28 | D. Auth | ESLint restricted-imports rules |
| 29 | D. Auth | Authenticated layout RSC with mustChangePassword gate |
| 30 | D. Auth | Onboarding route group + change-password flow |
| 31 | E. Shell | Health endpoint |
| 32 | E. Shell | Authenticated home page |
| 33 | E. Shell | Tailwind + minimal styling |
| 34 | F. Deploy | apps/web Dockerfile |
| 35 | F. Deploy | CNPG Cluster CR |
| 36 | F. Deploy | Sealed Secrets manifests |
| 37 | F. Deploy | Kustomize base for web Deployment |
| 38 | F. Deploy | ArgoCD root + child Applications |
| 39 | F. Deploy | GitHub Actions ci.yml |
| 40 | F. Deploy | GitHub Actions release.yml |
| 41 | F. Deploy | Pre-commit hook for unsealed Secrets |
| 42 | G. Tests | Playwright happy-path E2E |
| 43 | G. Docs | ADRs 0001–0005 |
| 44 | G. Docs | ADRs 0006–0010 |
| 45 | G. Docs | README — local dev, secret-sealing, version-update flows |
| 46 | G. Verify | Final acceptance-criteria checklist |

---

## Phase A — Repo Scaffold

### Task 1: git init, .gitignore, README skeleton

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Initialize git repo and create main branch**

Run:
```bash
cd /Users/toyinogunseinde/RMS
git init -b main
```

Expected: `Initialized empty Git repository in /Users/toyinogunseinde/RMS/.git/`

- [ ] **Step 2: Write .gitignore**

Create `/Users/toyinogunseinde/RMS/.gitignore` with exactly:

```gitignore
# deps
node_modules/
.pnpm-store/

# build
.next/
.turbo/
dist/
build/
out/
*.tsbuildinfo

# coverage and test artifacts
coverage/
playwright-report/
test-results/

# env
.env
.env.local
.env.*.local
!.env.example

# editor / OS
.DS_Store
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/

# logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*

# secrets — raw k8s Secret manifests are NEVER committed
deploy/**/Secret.yaml
deploy/**/*.secret.yaml
!deploy/**/*.sealedsecret.yaml

# generated Prisma client
packages/db/src/generated/
```

- [ ] **Step 3: Write README skeleton**

Create `/Users/toyinogunseinde/RMS/README.md` with exactly:

```markdown
# Solutio Installments

B2B SaaS for tracking property installment payment plans for Nigerian real estate companies.

**Phase 0 in progress.** See `docs/superpowers/specs/2026-05-12-solutio-phase0-design.md` for the spec and `docs/superpowers/plans/2026-05-12-solutio-phase0.md` for the implementation plan.

## Local development

To be completed in Task 45.

## Deploy

To be completed in Task 45.
```

- [ ] **Step 4: Verify nothing else exists**

Run:
```bash
ls -A
```

Expected output (order may vary):
```
.git
.gitignore
README.md
docs
```

- [ ] **Step 5: No commit yet** — first commit lands in Task 8 after all scaffolding is in place.

---

### Task 2: .nvmrc, .npmrc, .tool-versions

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `.tool-versions`

**Prerequisite:** You have run the version verification commands and have `<NODE_VERSION>`, `<PNPM_VERSION>`, `<KUBESEAL_VERSION>` in hand.

- [ ] **Step 1: Write .nvmrc**

Create `/Users/toyinogunseinde/RMS/.nvmrc`. Single line, no trailing whitespace:

```
<NODE_VERSION>
```

- [ ] **Step 2: Write .npmrc**

Create `/Users/toyinogunseinde/RMS/.npmrc` with exactly:

```
save-exact=true
save-prefix=""
engine-strict=true
auto-install-peers=true
```

- [ ] **Step 3: Write .tool-versions**

Create `/Users/toyinogunseinde/RMS/.tool-versions` with exactly:

```
nodejs <NODE_VERSION>
pnpm <PNPM_VERSION>
kubeseal <KUBESEAL_VERSION>
```

- [ ] **Step 4: Verify**

```bash
cat .nvmrc .npmrc .tool-versions
```

Expected: three files print without errors, no caret or tilde characters anywhere.

---

### Task 3: Root package.json + pnpm-workspace.yaml + turbo.json

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`

**Prerequisite:** values from Task 2 plus `<TURBO_VERSION>`, `<PRETTIER_VERSION>`, `<TYPESCRIPT_VERSION>`, `<VITEST_VERSION>`.

- [ ] **Step 1: Write package.json** (substitute pinned versions for placeholders)

```json
{
  "name": "solutio",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@<PNPM_VERSION>",
  "engines": {
    "node": "<NODE_VERSION>",
    "pnpm": "<PNPM_VERSION>"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --project integration",
    "test:coverage": "vitest run --coverage",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "guard:caret": "bash scripts/check-no-caret.sh",
    "guard:dockerfile": "bash scripts/check-no-unpinned-from.sh",
    "guard:actions": "bash scripts/check-no-unpinned-uses.sh",
    "guard:secrets": "bash scripts/check-no-unsealed-secret.sh",
    "guard:all": "pnpm guard:caret && pnpm guard:dockerfile && pnpm guard:actions && pnpm guard:secrets"
  },
  "devDependencies": {
    "turbo": "<TURBO_VERSION>",
    "prettier": "<PRETTIER_VERSION>",
    "typescript": "<TYPESCRIPT_VERSION>",
    "vitest": "<VITEST_VERSION>",
    "@vitest/coverage-v8": "<VITEST_VERSION>"
  }
}
```

- [ ] **Step 2: Write pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Write turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".nvmrc", ".npmrc"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

- [ ] **Step 4: Verify no caret or tilde**

```bash
grep -E '"[\^~]' package.json && echo "FAIL: caret/tilde found" || echo "PASS"
```

Expected: `PASS`

---

### Task 4: packages/config — tsconfig, eslint, prettier

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/eslint/index.js`
- Create: `packages/config/prettier/index.js`

**Prerequisite:** `<ESLINT_VERSION>`, `<TYPESCRIPT_ESLINT_VERSION>`.

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/config/tsconfig packages/config/eslint packages/config/prettier
```

- [ ] **Step 2: Write packages/config/package.json**

```json
{
  "name": "@solutio/config",
  "version": "0.0.0",
  "private": true,
  "main": "./eslint/index.js",
  "exports": {
    "./eslint": "./eslint/index.js",
    "./prettier": "./prettier/index.js",
    "./tsconfig/base.json": "./tsconfig/base.json"
  },
  "devDependencies": {
    "eslint": "<ESLINT_VERSION>",
    "@typescript-eslint/eslint-plugin": "<TYPESCRIPT_ESLINT_VERSION>",
    "@typescript-eslint/parser": "<TYPESCRIPT_ESLINT_VERSION>"
  }
}
```

- [ ] **Step 3: Write packages/config/tsconfig/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "incremental": true
  }
}
```

- [ ] **Step 4: Write packages/config/prettier/index.js**

```js
/** @type {import("prettier").Config} */
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  arrowParens: 'always',
};
```

- [ ] **Step 5: Write packages/config/eslint/index.js**

```js
/**
 * Shared ESLint config for Solutio.
 * Enforces two spec invariants via restricted-imports:
 *   1. getTenantContext only called at resolver boundaries (never in packages/shared).
 *   2. Raw Prisma client restricted to allow-listed paths.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  overrides: [
    {
      files: ['packages/shared/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/lib/tenant-context', '**/tenant-context'],
                message:
                  'Service functions in packages/shared/** must accept ctx as their explicit first parameter. See spec §6.5.',
              },
              {
                group: ['@solutio/db/client', '@solutio/db/src/client'],
                message:
                  'Raw Prisma client not allowed in packages/shared/**. Use forTenant() from @solutio/db.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      excludedFiles: [
        'apps/web/lib/auth.ts',
        'apps/web/lib/tenant-context.ts',
        'apps/web/app/api/health/route.ts',
        'apps/web/app/api/health/__tests__/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@solutio/db/client', '@solutio/db/src/client'],
                message:
                  'Raw Prisma client is restricted. Use forTenant() from @solutio/db. Allow-listed paths: apps/web/lib/auth.ts, apps/web/lib/tenant-context.ts, apps/web/app/api/health/route.ts.',
              },
            ],
          },
        ],
      },
    },
  ],
};
```

- [ ] **Step 6: Verify both JS configs parse**

```bash
node -e "require('./packages/config/eslint/index.js'); require('./packages/config/prettier/index.js'); console.log('OK')"
```

Expected: `OK`

---

### Task 5: Vitest workspace config

**Files:**
- Create: `vitest.workspace.ts`

- [ ] **Step 1: Write the file**

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'apps/web/vitest.config.ts',
]);
```

Per-package configs land in Tasks 9, 18, 24.

---

### Task 6: CI grep-guard scripts

**Files:**
- Create: `scripts/check-no-caret.sh`
- Create: `scripts/check-no-unpinned-from.sh`
- Create: `scripts/check-no-unpinned-uses.sh`
- Create: `scripts/check-no-unsealed-secret.sh`

- [ ] **Step 1: Create scripts directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Write scripts/check-no-caret.sh**

```bash
#!/usr/bin/env bash
# Fails if any package.json under apps/ or packages/ uses caret or tilde.
set -euo pipefail

violations=$(
  grep -rEn '"\s*[\^~]' \
    --include='package.json' \
    apps packages package.json 2>/dev/null \
    | grep -v '"version":' || true
)

if [[ -n "$violations" ]]; then
  echo "ERROR: caret/tilde version specifiers found:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "PASS: no caret or tilde in any package.json"
```

```bash
chmod +x scripts/check-no-caret.sh
```

- [ ] **Step 3: Write scripts/check-no-unpinned-from.sh**

```bash
#!/usr/bin/env bash
# Fails if any Dockerfile FROM line lacks an @sha256: digest.
set -euo pipefail

violations=$(
  find . -name 'Dockerfile' -not -path './node_modules/*' -print0 \
    | xargs -0 grep -EHn '^FROM ' \
    | grep -v '@sha256:' \
    || true
)

if [[ -n "$violations" ]]; then
  echo "ERROR: Dockerfile FROM lines missing @sha256: digest:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "PASS: all Dockerfile FROM lines are SHA-pinned"
```

```bash
chmod +x scripts/check-no-unpinned-from.sh
```

- [ ] **Step 4: Write scripts/check-no-unpinned-uses.sh**

```bash
#!/usr/bin/env bash
# Fails if any GitHub Actions `uses:` references a tag/branch instead of a commit SHA.
set -euo pipefail

violations=$(
  find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) -print0 2>/dev/null \
    | xargs -0 grep -EHn 'uses:' \
    | grep -vE 'uses:\s*(\./|[a-zA-Z0-9._/-]+@[0-9a-f]{40}\b)' \
    || true
)

if [[ -n "$violations" ]]; then
  echo "ERROR: workflow uses: not pinned to 40-char SHA:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "PASS: all workflow uses: are SHA-pinned"
```

```bash
chmod +x scripts/check-no-unpinned-uses.sh
```

- [ ] **Step 5: Write scripts/check-no-unsealed-secret.sh**

```bash
#!/usr/bin/env bash
# Fails if a raw kind: Secret manifest is committed under deploy/.
set -euo pipefail

violations=$(
  find deploy -type f \( -name '*.yaml' -o -name '*.yml' \) 2>/dev/null \
    | while read -r f; do
        if grep -qE '^kind:\s*Secret\b' "$f" && ! grep -qE '^kind:\s*SealedSecret\b' "$f"; then
          echo "$f"
        fi
      done || true
)

if [[ -n "$violations" ]]; then
  echo "ERROR: unsealed kind: Secret manifests in deploy/:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "PASS: no unsealed Secret manifests under deploy/"
```

```bash
chmod +x scripts/check-no-unsealed-secret.sh
```

- [ ] **Step 6: Verify all four guards run clean against the current (empty) tree**

```bash
bash scripts/check-no-caret.sh
bash scripts/check-no-unpinned-from.sh
bash scripts/check-no-unpinned-uses.sh
bash scripts/check-no-unsealed-secret.sh
```

Expected: four `PASS:` lines.

---

### Task 7: scripts/verify-versions.sh

**Files:**
- Create: `scripts/verify-versions.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Prints latest stable versions for every dependency Phase 0 pins.
set -euo pipefail

echo "=== Node (Active LTS) ==="
curl -s https://nodejs.org/dist/index.json \
  | jq -r '[.[] | select(.lts != false)] | .[0].version' \
  | sed 's/^v//'

for pkg in pnpm next typescript prisma @prisma/client zod vitest @vitest/coverage-v8 \
           @playwright/test better-auth tailwindcss react react-dom \
           @types/node @types/react @types/react-dom turbo eslint prettier tsx \
           testcontainers @testcontainers/postgresql \
           @typescript-eslint/eslint-plugin @typescript-eslint/parser; do
  printf '=== %s ===\n' "$pkg"
  npm view "$pkg" version
done

echo "=== Docker image digests (requires crane) ==="
if command -v crane >/dev/null 2>&1; then
  for img in \
    "node:24-bookworm-slim" \
    "gcr.io/distroless/nodejs24-debian12:latest" \
    "ghcr.io/cloudnative-pg/postgresql:18.3-bookworm" \
    "postgres:18.3-bookworm"; do
    printf '%-60s ' "$img"
    crane digest "$img" || echo "FAILED"
  done
else
  echo "crane not installed — brew install crane"
fi
```

```bash
chmod +x scripts/verify-versions.sh
bash scripts/verify-versions.sh | tee /tmp/solutio-versions.txt
```

Keep `/tmp/solutio-versions.txt` open while completing subsequent pin tasks.

---

### Task 8: Initial commit

- [ ] **Step 1: Stage and inspect**

```bash
git add .
git status
```

Expected: shows `.gitignore`, `.npmrc`, `.nvmrc`, `.tool-versions`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `vitest.workspace.ts`, `packages/config/**`, `scripts/**`, `docs/**`.

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: initialize Solutio Phase 0 scaffold"
```

Expected: commit created on `main`.

- [ ] **Step 3: Re-run guards to verify**

```bash
bash scripts/check-no-caret.sh
bash scripts/check-no-unpinned-from.sh
bash scripts/check-no-unpinned-uses.sh
bash scripts/check-no-unsealed-secret.sh
```

Expected: four `PASS:` lines.

---

## Phase B — Data Model

### Task 9: packages/db scaffold + Prisma init

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/prisma/schema.prisma` (skeleton — populated in Tasks 11–14)

**Prerequisite:** `<PRISMA_VERSION>`, `<PRISMA_CLIENT_VERSION>` (use the same value for both), `<TESTCONTAINERS_VERSION>`, `<POSTGRESQL_TC_VERSION>`, `<TSX_VERSION>` from `/tmp/solutio-versions.txt`.

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/db/src packages/db/prisma/migrations packages/db/__tests__
```

- [ ] **Step 2: Write packages/db/package.json**

```json
{
  "name": "@solutio/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./tenant-client": "./src/tenant-client.ts",
    "./seed": "./src/seed.ts"
  },
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:validate": "prisma validate",
    "prisma:diff": "prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code",
    "seed": "tsx src/seed.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration"
  },
  "dependencies": {
    "@prisma/client": "<PRISMA_CLIENT_VERSION>"
  },
  "devDependencies": {
    "@solutio/config": "workspace:*",
    "prisma": "<PRISMA_VERSION>",
    "typescript": "<TYPESCRIPT_VERSION>",
    "tsx": "<TSX_VERSION>",
    "vitest": "<VITEST_VERSION>",
    "testcontainers": "<TESTCONTAINERS_VERSION>",
    "@testcontainers/postgresql": "<POSTGRESQL_TC_VERSION>"
  }
}
```

- [ ] **Step 3: Write packages/db/tsconfig.json**

```json
{
  "extends": "@solutio/config/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "__tests__/**/*.ts"]
}
```

- [ ] **Step 4: Write packages/db/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['__tests__/**/*.integration.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
```

- [ ] **Step 5: Write packages/db/src/client.ts**

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Write packages/db/src/index.ts** (skeleton — re-exports added as features land)

```ts
export { prisma } from './client.js';
export type * from '@prisma/client';
```

- [ ] **Step 7: Write packages/db/prisma/schema.prisma** (skeleton with generator and datasource only)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "auth"]
}
```

- [ ] **Step 8: Run prisma validate**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: `The schema at prisma/schema.prisma is valid 🚀` (or similar success message). It is valid to have zero models at this point.

---

### Task 10: Bootstrap migration — CREATE SCHEMA auth

**Files:**
- Create: `packages/db/prisma/migrations/0000_init_schemas/migration.sql`
- Create: `packages/db/prisma/migrations/migration_lock.toml`

This task creates the migration manually rather than via `prisma migrate dev` because we want the bootstrap to be the very first migration applied.

- [ ] **Step 1: Create the migration directory**

```bash
mkdir -p packages/db/prisma/migrations/0000_init_schemas
```

- [ ] **Step 2: Write packages/db/prisma/migrations/0000_init_schemas/migration.sql**

```sql
-- Bootstrap: ensure the auth schema exists before Better Auth's first migration.
-- This is idempotent — CNPG's postInitSQL handles the cluster bootstrap, but
-- local dev databases need this migration to create the schema on first run.
CREATE SCHEMA IF NOT EXISTS auth;
```

- [ ] **Step 3: Write packages/db/prisma/migrations/migration_lock.toml**

```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

- [ ] **Step 4: No test yet** — exercised by Task 16's integration test which spins up a fresh Postgres container and runs `prisma migrate deploy`.

---

### Task 11: Prisma schema — Tenant + User + enums

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append to packages/db/prisma/schema.prisma**

```prisma
enum UserRole {
  OWNER
  ADMIN
  STAFF

  @@schema("public")
}

model Tenant {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  slug      String   @unique
  name      String
  currency  String   @default("NGN")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users      User[]
  customers  Customer[]
  properties Property[]
  plans      Plan[]

  @@schema("public")
}

model User {
  id                 String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId           String   @db.Uuid
  authUserId         String   @db.Uuid
  email              String
  name               String
  role               UserRole
  mustChangePassword Boolean  @default(false)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, authUserId])
  @@unique([authUserId])
  @@index([tenantId])
  @@schema("public")
}
```

- [ ] **Step 2: Validate**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: schema is valid.

---

### Task 12: Prisma schema — Customer + Property

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append**

```prisma
model Customer {
  id         String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId   String    @db.Uuid
  fullName   String
  email      String?
  phone      String
  nationalId String?
  notes      String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?
  createdBy  String?   @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plans  Plan[]

  @@index([tenantId])
  @@index([tenantId, phone])
  @@schema("public")
}

enum PropertyStatus {
  AVAILABLE
  RESERVED
  SOLD

  @@schema("public")
}

model Property {
  id             String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId       String         @db.Uuid
  code           String
  title          String
  addressLine    String
  city           String
  totalPriceKobo BigInt
  status         PropertyStatus @default(AVAILABLE)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?
  createdBy      String?        @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plans  Plan[]

  @@unique([tenantId, code])
  @@index([tenantId, status])
  @@schema("public")
}
```

- [ ] **Step 2: Validate**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: schema is valid (Plan model referenced but not yet defined — Prisma allows forward references; if validation fails because Plan isn't declared yet, proceed to Task 13 and re-validate at the end of it).

---

### Task 13: Prisma schema — Plan + Installment

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append**

```prisma
enum PlanStatus {
  DRAFT
  ACTIVE
  COMPLETED
  DEFAULTED
  CANCELLED

  @@schema("public")
}

model Plan {
  id             String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId       String     @db.Uuid
  customerId     String     @db.Uuid
  propertyId     String     @db.Uuid
  totalPriceKobo BigInt
  depositKobo    BigInt
  monthlyKobo    BigInt
  termMonths     Int
  startDate      DateTime   @db.Date
  status         PlanStatus @default(DRAFT)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  deletedAt      DateTime?
  createdBy      String?    @db.Uuid

  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  customer     Customer      @relation(fields: [customerId], references: [id])
  property     Property      @relation(fields: [propertyId], references: [id])
  installments Installment[]
  payments     Payment[]

  @@index([tenantId, status])
  @@index([tenantId, customerId])
  @@index([tenantId, propertyId, status])
  @@schema("public")
}

enum InstallmentStatus {
  PENDING
  PARTIAL
  PAID
  OVERDUE
  WAIVED

  @@schema("public")
}

model Installment {
  id             String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId       String            @db.Uuid
  planId         String            @db.Uuid
  sequenceNo     Int
  dueDate        DateTime          @db.Date
  amountDueKobo  BigInt
  amountPaidKobo BigInt            @default(0)
  status         InstallmentStatus @default(PENDING)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  plan        Plan                @relation(fields: [planId], references: [id])
  allocations PaymentAllocation[]

  @@unique([planId, sequenceNo])
  @@index([tenantId, status, dueDate])
  @@schema("public")
}
```

- [ ] **Step 2: Validate**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: schema is valid (Payment and PaymentAllocation are still forward refs — proceed to Task 14).

---

### Task 14: Prisma schema — Payment + PaymentAllocation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Append**

```prisma
enum PaymentMethod {
  CASH
  TRANSFER
  CHEQUE
  CARD_MANUAL
  OTHER

  @@schema("public")
}

model Payment {
  id           String        @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId     String        @db.Uuid
  planId       String        @db.Uuid
  amountKobo   BigInt
  paidAt       DateTime
  method       PaymentMethod
  reference    String?
  notes        String?
  recordedBy   String        @db.Uuid
  reversedById String?       @db.Uuid
  createdAt    DateTime      @default(now())

  plan        Plan                @relation(fields: [planId], references: [id])
  allocations PaymentAllocation[]
  reversedBy  Payment?            @relation("PaymentReversal", fields: [reversedById], references: [id])
  reverses    Payment[]           @relation("PaymentReversal")

  @@index([tenantId, planId, paidAt])
  @@schema("public")
}

model PaymentAllocation {
  id            String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String   @db.Uuid
  paymentId     String   @db.Uuid
  installmentId String   @db.Uuid
  amountKobo    BigInt
  createdAt     DateTime @default(now())

  payment     Payment     @relation(fields: [paymentId], references: [id])
  installment Installment @relation(fields: [installmentId], references: [id])

  @@index([tenantId, paymentId])
  @@index([tenantId, installmentId])
  @@schema("public")
}
```

- [ ] **Step 2: Validate the full schema**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: schema is valid, all forward references resolved.

- [ ] **Step 3: Generate the initial schema migration**

```bash
cd packages/db && pnpm prisma migrate dev --create-only --name phase0_schema; cd ../..
```

Expected: a new directory `prisma/migrations/0001_phase0_schema/migration.sql` is created (numbered after the `0000_init_schemas` bootstrap). Inspect the file — it should contain `CREATE TABLE` statements for all 8 models, `CREATE TYPE` for the 5 enums, FK constraints, and the `@@unique` / `@@index` directives translated to `CREATE INDEX`/`CREATE UNIQUE INDEX`.

(Use `--create-only` so we can review and append the raw-SQL partial indexes in Task 15 before applying.)

---

### Task 15: Raw-SQL partial indexes

**Files:**
- Modify: `packages/db/prisma/migrations/0001_phase0_schema/migration.sql` (append to end)

- [ ] **Step 1: Open the generated migration file and append these statements at the end**

```sql

-- ============================================================================
-- Partial indexes — hot path on active rows only.
-- See ADR-0008 and spec §5.3.
-- ============================================================================

CREATE INDEX customer_active_idx
  ON "public"."Customer"("tenantId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX property_active_idx
  ON "public"."Property"("tenantId", "status")
  WHERE "deletedAt" IS NULL;

CREATE INDEX plan_active_idx
  ON "public"."Plan"("tenantId", "status")
  WHERE "deletedAt" IS NULL;

-- DB-enforced invariant: at most one ACTIVE or COMPLETED Plan per Property.
-- Service layer also checks this in a SERIALIZABLE transaction; this is the
-- belt-and-suspenders guarantee.
CREATE UNIQUE INDEX plan_one_active_per_property
  ON "public"."Plan"("tenantId", "propertyId")
  WHERE "status" IN ('ACTIVE', 'COMPLETED') AND "deletedAt" IS NULL;
```

- [ ] **Step 2: Verify the migration still parses**

```bash
cd packages/db && pnpm prisma:validate; cd ../..
```

Expected: schema validates (migration files are not validated by `prisma validate`, but the schema-vs-migration drift check happens in Task 16).

---

### Task 16: forTenant() client extension + integration tests

**Files:**
- Create: `packages/db/src/tenant-client.ts`
- Create: `packages/db/__tests__/_helpers/postgres.ts`
- Create: `packages/db/__tests__/tenant-client.integration.test.ts`
- Create: `packages/db/__tests__/partial-indexes.integration.test.ts`
- Modify: `packages/db/src/index.ts`

**Prerequisite:** `<POSTGRES_TC_DIGEST>` from `crane digest postgres:18.3-bookworm` (recorded in /tmp/solutio-versions.txt).

- [ ] **Step 1: Write packages/db/__tests__/_helpers/postgres.ts**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';

const PG_IMAGE = 'postgres:18.3-bookworm@sha256:<POSTGRES_TC_DIGEST>';

export type TestPostgres = {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  prisma: PrismaClient;
  stop: () => Promise<void>;
};

export async function startPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(PG_IMAGE)
    .withDatabase('solutio_test')
    .withUsername('solutio')
    .withPassword('solutio')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  // Apply all migrations (including the auth-schema bootstrap)
  const dbPackageDir = path.resolve(__dirname, '..', '..');
  execSync('pnpm prisma migrate deploy', {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  return {
    container,
    databaseUrl,
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
```

- [ ] **Step 2: Write packages/db/src/tenant-client.ts**

```ts
import { Prisma, PrismaClient } from '@prisma/client';

const TENANT_SCOPED_MODELS = [
  'User',
  'Customer',
  'Property',
  'Plan',
  'Installment',
  'Payment',
  'PaymentAllocation',
] as const;

type ScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export class CrossTenantWriteError extends Error {
  constructor(model: string, attempted: string, expected: string) {
    super(
      `Cross-tenant write rejected on ${model}: caller scoped to tenantId=${expected} but write payload contained tenantId=${attempted}`,
    );
    this.name = 'CrossTenantWriteError';
  }
}

/**
 * Returns a Prisma client whose queries are auto-scoped to the given tenantId.
 *
 * - Reads on tenant-scoped models auto-inject { where: { tenantId } }.
 * - Writes auto-inject { data: { tenantId } } unless an explicit tenantId is
 *   provided. If an explicit tenantId is provided AND it differs from the
 *   caller's tenantId, the write is rejected with CrossTenantWriteError.
 *
 * Tenant table is excluded — operations on the Tenant table go through the raw
 * client (allow-listed paths only).
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scoped',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.includes(model as ScopedModel)) {
            return query(args);
          }
          const isRead = ['findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'].includes(operation);
          const isWrite = ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(operation);

          if (isRead) {
            const a = args as { where?: Record<string, unknown> };
            a.where = { ...(a.where ?? {}), tenantId };
            return query(a);
          }

          if (isWrite) {
            const a = args as {
              data?: Record<string, unknown> | Record<string, unknown>[];
              where?: Record<string, unknown>;
            };
            if (a.where) a.where = { ...a.where, tenantId };
            if (Array.isArray(a.data)) {
              a.data = a.data.map((row) => assertOrInjectTenantId(model, row, tenantId));
            } else if (a.data) {
              a.data = assertOrInjectTenantId(model, a.data, tenantId);
            }
            return query(a);
          }
          return query(args);
        },
      },
    },
  });
}

function assertOrInjectTenantId(
  model: string,
  data: Record<string, unknown>,
  expectedTenantId: string,
): Record<string, unknown> {
  if ('tenantId' in data && data.tenantId !== undefined) {
    if (data.tenantId !== expectedTenantId) {
      throw new CrossTenantWriteError(model, String(data.tenantId), expectedTenantId);
    }
    return data;
  }
  return { ...data, tenantId: expectedTenantId };
}

export type TenantPrismaClient = ReturnType<typeof forTenant>;
```

- [ ] **Step 3: Update packages/db/src/index.ts**

```ts
export { prisma } from './client.js';
export { forTenant, CrossTenantWriteError } from './tenant-client.js';
export type { TenantPrismaClient } from './tenant-client.js';
export type * from '@prisma/client';
```

- [ ] **Step 4: Write the failing partial-index integration test**

Create `packages/db/__tests__/partial-indexes.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';

let pg: TestPostgres;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.stop();
});

describe('partial indexes from migration 0001', () => {
  test('customer_active_idx exists with WHERE deleted_at IS NULL', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'customer_active_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('WHERE');
    expect(rows[0]!.indexdef).toContain('deletedAt');
  });

  test('property_active_idx exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'property_active_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('plan_active_idx exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'plan_active_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  test('plan_one_active_per_property is a UNIQUE partial index', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'plan_one_active_per_property'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('UNIQUE');
    expect(rows[0]!.indexdef.toUpperCase()).toContain(`'ACTIVE'`);
  });

  test('auth schema exists', async () => {
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ schema_name: string }>>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth'`,
    );
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Write the failing tenant-client integration test**

Create `packages/db/__tests__/tenant-client.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { forTenant, CrossTenantWriteError } from '../src/tenant-client.js';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000001';
const TENANT_B = '01935b7e-0000-7000-8000-000000000002';

beforeAll(async () => {
  pg = await startPostgres();
  // Seed two tenants directly via raw client (allow-listed)
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'tenant-a', name: 'Tenant A' },
      { id: TENANT_B, slug: 'tenant-b', name: 'Tenant B' },
    ],
  });
});

afterAll(async () => {
  await pg?.stop();
});

describe('forTenant() — auto-scoped Prisma client', () => {
  test('create auto-injects tenantId', async () => {
    const db = forTenant(pg.prisma, TENANT_A);
    const created = await db.customer.create({
      data: { fullName: 'Adaeze Okafor', phone: '+2348012345001' },
    });
    expect(created.tenantId).toBe(TENANT_A);
  });

  test('findMany auto-scopes by tenantId — cross-tenant rows invisible', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    const dbB = forTenant(pg.prisma, TENANT_B);
    await dbB.customer.create({
      data: { fullName: 'Other Tenant Customer', phone: '+2348012345099' },
    });
    const aRows = await dbA.customer.findMany();
    expect(aRows.every((r) => r.tenantId === TENANT_A)).toBe(true);
    expect(aRows.some((r) => r.fullName === 'Other Tenant Customer')).toBe(false);
  });

  test('explicit cross-tenant write is rejected', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    await expect(
      dbA.customer.create({
        data: {
          tenantId: TENANT_B,
          fullName: 'Hostile Insert',
          phone: '+2348012345111',
        },
      }),
    ).rejects.toBeInstanceOf(CrossTenantWriteError);
  });

  test('explicit same-tenant write is allowed', async () => {
    const dbA = forTenant(pg.prisma, TENANT_A);
    const ok = await dbA.customer.create({
      data: {
        tenantId: TENANT_A,
        fullName: 'Same Tenant Explicit',
        phone: '+2348012345222',
      },
    });
    expect(ok.tenantId).toBe(TENANT_A);
  });
});
```

- [ ] **Step 6: Run the tests — expect them to PASS the first time**

```bash
cd packages/db && pnpm test:integration; cd ../..
```

Expected: all tests in `partial-indexes.integration.test.ts` and `tenant-client.integration.test.ts` pass. (We wrote the implementation in Steps 1-3 alongside the tests because the implementation is the contract under test.)

If any fail: do not modify the tests. Fix the implementation in `src/tenant-client.ts` or the migration SQL in `0001_phase0_schema/migration.sql`.

- [ ] **Step 7: Verify migrate-diff shows no drift**

```bash
cd packages/db && pnpm prisma:diff; cd ../..
```

Expected: exit code 0, no drift. (Drift would mean schema.prisma and the migrations folder disagree.)

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): Phase 0 Prisma schema with row-level tenancy and partial indexes"
```

---

### Task 17: Seed script

**Files:**
- Create: `packages/db/src/seed.ts`
- Create: `packages/db/__tests__/seed-idempotent.integration.test.ts`

The seed script's job is: idempotently upsert the Atrium tenant and one OWNER user, linked to a Better Auth account. **Better Auth wiring lands in Task 25**, so this task creates the seed in a form that compiles and is partially testable now; the Better Auth signup call is wired in as part of Task 25.

- [ ] **Step 1: Write packages/db/src/seed.ts** (Phase 0 seed — Better Auth call stubbed via a callback, wired in Task 25)

```ts
import { prisma } from './client.js';

const ATRIUM_TENANT = {
  slug: 'atrium-homes',
  name: 'Atrium Homes',
  currency: 'NGN',
};

export type SeedAuthAdapter = {
  /**
   * Creates (or returns existing) Better Auth user for the seed owner.
   * Returns the stable auth user id used as the join key on the domain User row.
   */
  ensureOwnerAuthUser(email: string, password: string): Promise<{ authUserId: string }>;
};

export type SeedOptions = {
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
  authAdapter: SeedAuthAdapter;
};

export async function seed(opts: SeedOptions) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: ATRIUM_TENANT.slug },
    create: ATRIUM_TENANT,
    update: { name: ATRIUM_TENANT.name },
  });

  const { authUserId } = await opts.authAdapter.ensureOwnerAuthUser(
    opts.ownerEmail,
    opts.ownerPassword,
  );

  const user = await prisma.user.upsert({
    where: { authUserId },
    create: {
      tenantId: tenant.id,
      authUserId,
      email: opts.ownerEmail,
      name: opts.ownerName,
      role: 'OWNER',
      mustChangePassword: true,
    },
    update: {
      email: opts.ownerEmail,
      name: opts.ownerName,
    },
  });

  return { tenant, user };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    console.error('SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD must be set.');
    process.exit(1);
  }
  const { createSeedAuthAdapter } = await import('../../../apps/web/lib/auth.js')
    .catch(() => ({ createSeedAuthAdapter: undefined }));
  if (!createSeedAuthAdapter) {
    console.error('apps/web auth module not built. Run pnpm --filter @solutio/web build first.');
    process.exit(1);
  }
  await seed({
    ownerEmail: email,
    ownerPassword: password,
    ownerName: process.env.SEED_OWNER_NAME ?? 'Atrium Owner',
    authAdapter: createSeedAuthAdapter(),
  });
  console.log('Seed complete.');
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Write the failing seed idempotency test**

Create `packages/db/__tests__/seed-idempotent.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { seed, type SeedAuthAdapter } from '../src/seed.js';
import { prisma } from '../src/client.js';

let pg: TestPostgres;

const FAKE_AUTH_USER_ID = '01935b7e-1111-7111-8111-111111111111';
const stubAdapter: SeedAuthAdapter = {
  async ensureOwnerAuthUser() {
    return { authUserId: FAKE_AUTH_USER_ID };
  },
};

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.stop();
});

describe('seed() idempotency', () => {
  test('running twice leaves exactly one Atrium tenant and one OWNER user', async () => {
    await seed({
      ownerEmail: 'owner@atrium.test',
      ownerPassword: 'irrelevant-stub',
      ownerName: 'Atrium Owner',
      authAdapter: stubAdapter,
    });
    await seed({
      ownerEmail: 'owner@atrium.test',
      ownerPassword: 'irrelevant-stub',
      ownerName: 'Atrium Owner',
      authAdapter: stubAdapter,
    });

    const tenants = await prisma.tenant.findMany({ where: { slug: 'atrium-homes' } });
    expect(tenants).toHaveLength(1);

    const users = await prisma.user.findMany({ where: { authUserId: FAKE_AUTH_USER_ID } });
    expect(users).toHaveLength(1);
    expect(users[0]!.role).toBe('OWNER');
    expect(users[0]!.mustChangePassword).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd packages/db && pnpm test:integration -- seed-idempotent; cd ../..
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed.ts packages/db/__tests__/seed-idempotent.integration.test.ts
git commit -m "feat(db): idempotent seed for Atrium tenant + OWNER user"
```

---

## Phase C — Domain Logic in `packages/shared`

### Task 18: packages/shared scaffold + money/

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/money/index.ts`
- Create: `packages/shared/src/money/kobo.ts`
- Create: `packages/shared/src/money/types.ts`
- Create: `packages/shared/src/money/__tests__/kobo.test.ts`

**Prerequisite:** `<ZOD_VERSION>` from `/tmp/solutio-versions.txt`.

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/shared/src/money/__tests__
mkdir -p packages/shared/src/installments/__tests__
mkdir -p packages/shared/src/payments/__tests__
mkdir -p packages/shared/src/tenant/__tests__
```

- [ ] **Step 2: Write packages/shared/package.json**

```json
{
  "name": "@solutio/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./installments": "./src/installments/index.ts",
    "./payments": "./src/payments/index.ts",
    "./money": "./src/money/index.ts",
    "./tenant": "./src/tenant/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "<ZOD_VERSION>"
  },
  "devDependencies": {
    "@solutio/config": "workspace:*",
    "typescript": "<TYPESCRIPT_VERSION>",
    "vitest": "<VITEST_VERSION>"
  }
}
```

- [ ] **Step 3: Write packages/shared/tsconfig.json**

```json
{
  "extends": "@solutio/config/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Write packages/shared/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    include: ['src/**/__tests__/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write the failing money test FIRST**

Create `packages/shared/src/money/__tests__/kobo.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { Kobo, formatKobo, koboFromNaira, koboToNaira, sumKobo } from '../kobo.js';

describe('Kobo brand', () => {
  test('koboFromNaira converts whole naira', () => {
    expect(koboFromNaira(100)).toBe(10_000n as Kobo);
  });

  test('koboFromNaira converts fractional naira (kobo-precise)', () => {
    expect(koboFromNaira(99.5)).toBe(9_950n as Kobo);
  });

  test('koboFromNaira rounds half-even on sub-kobo input', () => {
    expect(koboFromNaira(0.005)).toBe(0n as Kobo);
    expect(koboFromNaira(0.015)).toBe(2n as Kobo);
    expect(koboFromNaira(0.025)).toBe(2n as Kobo);
  });

  test('koboFromNaira rejects negative zero spam', () => {
    expect(koboFromNaira(-0)).toBe(0n as Kobo);
  });

  test('koboToNaira returns plain number for display', () => {
    expect(koboToNaira(25_000_050n as Kobo)).toBe(250_000.5);
  });

  test('formatKobo renders Nigerian Naira', () => {
    expect(formatKobo(25_000_050n as Kobo)).toBe('₦250,000.50');
    expect(formatKobo(0n as Kobo)).toBe('₦0.00');
    expect(formatKobo(99n as Kobo)).toBe('₦0.99');
  });

  test('formatKobo handles negatives (reversal rows)', () => {
    expect(formatKobo(-25_000_050n as Kobo)).toBe('-₦250,000.50');
  });

  test('sumKobo adds an array', () => {
    expect(sumKobo([100n, 200n, 300n] as Kobo[])).toBe(600n as Kobo);
    expect(sumKobo([] as Kobo[])).toBe(0n as Kobo);
  });

  test('large amounts (₦100M+)', () => {
    const huge = koboFromNaira(100_000_000);
    expect(huge).toBe(10_000_000_000n as Kobo);
    expect(formatKobo(huge)).toBe('₦100,000,000.00');
  });
});
```

- [ ] **Step 6: Run the test — expect FAIL**

```bash
cd packages/shared && pnpm test -- kobo; cd ../..
```

Expected: FAIL with "Cannot find module '../kobo.js'" or similar.

- [ ] **Step 7: Write packages/shared/src/money/types.ts**

```ts
/**
 * Branded BigInt for Nigerian Naira minor units.
 * 1 NGN = 100 kobo. Negative values are valid (reversal rows).
 */
export type Kobo = bigint & { readonly __brand: 'Kobo' };
```

- [ ] **Step 8: Write packages/shared/src/money/kobo.ts**

```ts
import type { Kobo } from './types.js';

export type { Kobo } from './types.js';

/**
 * Convert a naira amount (possibly fractional) to kobo.
 * Uses banker's rounding (half-even) on sub-kobo fractions.
 */
export function koboFromNaira(naira: number): Kobo {
  if (Object.is(naira, -0)) return 0n as Kobo;
  const scaled = naira * 100;
  return BigInt(Math.round(evenRound(scaled))) as Kobo;
}

function evenRound(n: number): number {
  const rounded = Math.round(n);
  if (Math.abs(n - Math.trunc(n)) === 0.5) {
    return rounded % 2 === 0 ? rounded : rounded - Math.sign(n);
  }
  return rounded;
}

/** Lossy convert back to a Number for display only. Do not use for math. */
export function koboToNaira(kobo: Kobo): number {
  return Number(kobo) / 100;
}

const NAIRA_FORMATTER = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatKobo(kobo: Kobo): string {
  const negative = kobo < 0n;
  const absolute = negative ? -kobo : kobo;
  const naira = absolute / 100n;
  const remainder = absolute % 100n;
  const nairaPart = NAIRA_FORMATTER.format(Number(naira));
  const koboPart = remainder.toString().padStart(2, '0');
  return `${negative ? '-' : ''}₦${nairaPart}.${koboPart}`;
}

export function sumKobo(values: Kobo[]): Kobo {
  let total = 0n;
  for (const v of values) total += v;
  return total as Kobo;
}
```

- [ ] **Step 9: Write packages/shared/src/money/index.ts**

```ts
export * from './kobo.js';
export type { Kobo } from './types.js';
```

- [ ] **Step 10: Write packages/shared/src/index.ts**

```ts
export * as money from './money/index.js';
```

- [ ] **Step 11: Run the test — expect PASS**

```bash
cd packages/shared && pnpm test -- kobo; cd ../..
```

Expected: 9 passing.

- [ ] **Step 12: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): money/ — branded Kobo BigInt with format/sum/round helpers"
```

---

### Task 19: installments/ — schedule generation

**Files:**
- Create: `packages/shared/src/installments/types.ts`
- Create: `packages/shared/src/installments/schedule.ts`
- Create: `packages/shared/src/installments/__tests__/schedule.test.ts`

- [ ] **Step 1: Write the failing schedule test FIRST**

Create `packages/shared/src/installments/__tests__/schedule.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { koboFromNaira, sumKobo, type Kobo } from '../../money/index.js';
import { generateSchedule } from '../schedule.js';

describe('generateSchedule', () => {
  test('emits sequenceNo=0 deposit followed by termMonths monthlies', () => {
    const rows = generateSchedule({
      totalPriceKobo: koboFromNaira(12_000_000),
      depositKobo: koboFromNaira(2_400_000),
      monthlyKobo: koboFromNaira(800_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(rows).toHaveLength(13);
    expect(rows[0]!.sequenceNo).toBe(0);
    expect(rows[0]!.amountDueKobo).toBe(koboFromNaira(2_400_000));
    expect(rows[12]!.sequenceNo).toBe(12);
  });

  test('schedule sum equals totalPriceKobo exactly', () => {
    const total = koboFromNaira(15_000_000);
    const rows = generateSchedule({
      totalPriceKobo: total,
      depositKobo: koboFromNaira(3_000_000),
      monthlyKobo: koboFromNaira(1_000_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(sumKobo(rows.map((r) => r.amountDueKobo))).toBe(total);
  });

  test('rounding remainder is absorbed by the final installment', () => {
    // 10,000,000 - 1,000,000 deposit = 9,000,000 over 7 months
    // Monthly would be 1,285,714.28571... — pick 1,285,714 and let final absorb 6
    const total = koboFromNaira(10_000_000);
    const rows = generateSchedule({
      totalPriceKobo: total,
      depositKobo: koboFromNaira(1_000_000),
      monthlyKobo: 128_571_400n as Kobo, // ₦1,285,714.00 kobo-precise
      termMonths: 7,
      startDate: new Date('2026-06-01T00:00:00Z'),
    });
    expect(rows).toHaveLength(8);
    expect(sumKobo(rows.map((r) => r.amountDueKobo))).toBe(total);
    const monthlies = rows.slice(1);
    expect(monthlies.slice(0, 6).every((r) => r.amountDueKobo === 128_571_400n)).toBe(true);
    expect(monthlies[6]!.amountDueKobo).toBeGreaterThan(128_571_400n);
  });

  test('dueDate increments by month from startDate, deposit due on startDate', () => {
    const rows = generateSchedule({
      totalPriceKobo: koboFromNaira(2_400_000),
      depositKobo: koboFromNaira(400_000),
      monthlyKobo: koboFromNaira(1_000_000),
      termMonths: 2,
      startDate: new Date('2026-06-15T00:00:00Z'),
    });
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe('2026-08-15');
  });

  test('rejects termMonths < 6', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(100_000),
        monthlyKobo: koboFromNaira(180_000),
        termMonths: 5,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/termMonths/);
  });

  test('rejects termMonths > 36', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(50_000_000),
        depositKobo: koboFromNaira(5_000_000),
        monthlyKobo: koboFromNaira(1_200_000),
        termMonths: 37,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/termMonths/);
  });

  test('rejects depositKobo > totalPriceKobo', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(2_000_000),
        monthlyKobo: koboFromNaira(100_000),
        termMonths: 6,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/depositKobo/);
  });

  test('rejects monthlyKobo * termMonths + deposit < total (would underfund)', () => {
    expect(() =>
      generateSchedule({
        totalPriceKobo: koboFromNaira(1_000_000),
        depositKobo: koboFromNaira(100_000),
        monthlyKobo: koboFromNaira(50_000), // 50k * 6 + 100k = 400k, undersub
        termMonths: 6,
        startDate: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toThrow(/underfund/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** ("Cannot find module '../schedule.js'")

```bash
cd packages/shared && pnpm test -- schedule; cd ../..
```

- [ ] **Step 3: Write packages/shared/src/installments/types.ts**

```ts
import type { Kobo } from '../money/index.js';

export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';

export type ScheduleRow = {
  sequenceNo: number;
  dueDate: Date;
  amountDueKobo: Kobo;
};

export type ScheduleInput = {
  totalPriceKobo: Kobo;
  depositKobo: Kobo;
  monthlyKobo: Kobo;
  termMonths: number;
  startDate: Date;
};
```

- [ ] **Step 4: Write packages/shared/src/installments/schedule.ts**

```ts
import type { Kobo } from '../money/index.js';
import type { ScheduleInput, ScheduleRow } from './types.js';

const MIN_TERM = 6;
const MAX_TERM = 36;

export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  const { totalPriceKobo, depositKobo, monthlyKobo, termMonths, startDate } = input;

  if (termMonths < MIN_TERM || termMonths > MAX_TERM) {
    throw new Error(`termMonths must be between ${MIN_TERM} and ${MAX_TERM}, got ${termMonths}`);
  }
  if (depositKobo > totalPriceKobo) {
    throw new Error('depositKobo cannot exceed totalPriceKobo');
  }
  const monthlyTotal = monthlyKobo * BigInt(termMonths);
  const sumStandard = depositKobo + monthlyTotal;
  if (sumStandard < totalPriceKobo) {
    throw new Error(
      `Plan would underfund: deposit + monthly*term (${sumStandard}) < total (${totalPriceKobo})`,
    );
  }

  const rows: ScheduleRow[] = [];
  rows.push({
    sequenceNo: 0,
    dueDate: new Date(startDate),
    amountDueKobo: depositKobo,
  });

  const remaining = totalPriceKobo - depositKobo;
  const standardMonthsTotal = monthlyKobo * BigInt(termMonths - 1);
  const finalAmount = (remaining - standardMonthsTotal) as Kobo;

  for (let i = 1; i <= termMonths; i++) {
    const due = addMonths(startDate, i);
    const amount = i === termMonths ? finalAmount : monthlyKobo;
    rows.push({ sequenceNo: i, dueDate: due, amountDueKobo: amount });
  }
  return rows;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  return d;
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/shared && pnpm test -- schedule; cd ../..
```

Expected: 8 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/installments
git commit -m "feat(shared): installments/schedule generation with rounding into final row"
```

---

### Task 20: installments/ — status derivation

**Files:**
- Create: `packages/shared/src/installments/status.ts`
- Create: `packages/shared/src/installments/index.ts`
- Create: `packages/shared/src/installments/__tests__/status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/installments/__tests__/status.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { koboFromNaira } from '../../money/index.js';
import { deriveInstallmentStatus } from '../status.js';

const today = new Date('2026-07-15T00:00:00Z');

describe('deriveInstallmentStatus', () => {
  test('zero paid, due in future → PENDING', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PENDING');
  });

  test('zero paid, past due → OVERDUE', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('OVERDUE');
  });

  test('partial paid → PARTIAL regardless of due date', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(40_000),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PARTIAL');
  });

  test('fully paid → PAID', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(100_000),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PAID');
  });

  test('overpaid → PAID (excess belongs on a subsequent row, not here)', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(150_000),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'PENDING',
        today,
      }),
    ).toBe('PAID');
  });

  test('WAIVED is a sticky terminal state — never re-derived away', () => {
    expect(
      deriveInstallmentStatus({
        amountDueKobo: koboFromNaira(100_000),
        amountPaidKobo: koboFromNaira(0),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        currentStatus: 'WAIVED',
        today,
      }),
    ).toBe('WAIVED');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/shared && pnpm test -- status; cd ../..
```

- [ ] **Step 3: Write packages/shared/src/installments/status.ts**

```ts
import type { Kobo } from '../money/index.js';
import type { InstallmentStatus } from './types.js';

export type DeriveStatusInput = {
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
  dueDate: Date;
  currentStatus: InstallmentStatus;
  today: Date;
};

export function deriveInstallmentStatus(input: DeriveStatusInput): InstallmentStatus {
  if (input.currentStatus === 'WAIVED') return 'WAIVED';
  if (input.amountPaidKobo >= input.amountDueKobo) return 'PAID';
  if (input.amountPaidKobo > 0n) return 'PARTIAL';
  return input.dueDate.getTime() < input.today.getTime() ? 'OVERDUE' : 'PENDING';
}
```

- [ ] **Step 4: Write packages/shared/src/installments/index.ts**

```ts
export * from './schedule.js';
export * from './status.js';
export type * from './types.js';
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/shared && pnpm test -- status; cd ../..
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/installments
git commit -m "feat(shared): installments/status derivation with WAIVED stickiness"
```

---

### Task 21: payments/ — allocation logic

**Files:**
- Create: `packages/shared/src/payments/types.ts`
- Create: `packages/shared/src/payments/allocate.ts`
- Create: `packages/shared/src/payments/index.ts`
- Create: `packages/shared/src/payments/__tests__/allocate.test.ts`

The pure-function `allocatePayment` decides how a single Payment amount maps onto a Plan's current Installments. It does not write to the DB — that happens at the call site inside a transaction (wired in Phase 2 when Paystack lands; for Phase 0 the manual-payment UI is wired in Phase 1).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/payments/__tests__/allocate.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { koboFromNaira, type Kobo } from '../../money/index.js';
import { allocatePayment } from '../allocate.js';

function inst(seq: number, due: Kobo, paid: Kobo = 0n as Kobo) {
  return {
    id: `inst-${seq}`,
    sequenceNo: seq,
    amountDueKobo: due,
    amountPaidKobo: paid,
  };
}

describe('allocatePayment', () => {
  test('one payment fully covers one installment', () => {
    const result = allocatePayment(koboFromNaira(100_000), [inst(0, koboFromNaira(100_000))]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(100_000) },
    ]);
    expect(result.remainderKobo).toBe(0n);
  });

  test('one payment spans multiple installments in sequence order', () => {
    const result = allocatePayment(koboFromNaira(250_000), [
      inst(0, koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
      inst(2, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(100_000) },
      { installmentId: 'inst-1', amountKobo: koboFromNaira(100_000) },
      { installmentId: 'inst-2', amountKobo: koboFromNaira(50_000) },
    ]);
    expect(result.remainderKobo).toBe(0n);
  });

  test('skips installments already fully paid', () => {
    const result = allocatePayment(koboFromNaira(80_000), [
      inst(0, koboFromNaira(100_000), koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-1', amountKobo: koboFromNaira(80_000) },
    ]);
  });

  test('credits partial-paid installments before moving on', () => {
    const result = allocatePayment(koboFromNaira(150_000), [
      inst(0, koboFromNaira(100_000), koboFromNaira(40_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations).toEqual([
      { installmentId: 'inst-0', amountKobo: koboFromNaira(60_000) },
      { installmentId: 'inst-1', amountKobo: koboFromNaira(90_000) },
    ]);
  });

  test('overpayment is returned as remainder, not silently dropped', () => {
    const result = allocatePayment(koboFromNaira(500_000), [
      inst(0, koboFromNaira(100_000)),
      inst(1, koboFromNaira(100_000)),
    ]);
    expect(result.allocations.map((a) => a.amountKobo)).toEqual([
      koboFromNaira(100_000),
      koboFromNaira(100_000),
    ]);
    expect(result.remainderKobo).toBe(koboFromNaira(300_000));
  });

  test('rejects negative amount via thrown error (use reversal flow instead)', () => {
    expect(() =>
      allocatePayment(-100n as Kobo, [inst(0, koboFromNaira(100_000))]),
    ).toThrow(/negative/);
  });

  test('rejects zero amount', () => {
    expect(() =>
      allocatePayment(0n as Kobo, [inst(0, koboFromNaira(100_000))]),
    ).toThrow(/zero/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/shared && pnpm test -- allocate; cd ../..
```

- [ ] **Step 3: Write packages/shared/src/payments/types.ts**

```ts
import type { Kobo } from '../money/index.js';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CHEQUE' | 'CARD_MANUAL' | 'OTHER';

export type InstallmentRow = {
  id: string;
  sequenceNo: number;
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
};

export type Allocation = {
  installmentId: string;
  amountKobo: Kobo;
};

export type AllocationResult = {
  allocations: Allocation[];
  remainderKobo: Kobo;
};
```

- [ ] **Step 4: Write packages/shared/src/payments/allocate.ts**

```ts
import type { Kobo } from '../money/index.js';
import type { AllocationResult, InstallmentRow } from './types.js';

/**
 * Pure function — allocates a positive payment amount across installments
 * in sequence order. Caller persists allocations inside a DB transaction.
 *
 * Reversal payments (amountKobo < 0) use a separate flow — not this function.
 */
export function allocatePayment(amountKobo: Kobo, installments: InstallmentRow[]): AllocationResult {
  if (amountKobo === 0n) throw new Error('amountKobo must be non-zero');
  if (amountKobo < 0n) throw new Error('amountKobo cannot be negative — use the reversal flow');

  const sorted = [...installments].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const allocations: AllocationResult['allocations'] = [];
  let remaining = amountKobo;

  for (const inst of sorted) {
    if (remaining === 0n) break;
    const outstanding = inst.amountDueKobo - inst.amountPaidKobo;
    if (outstanding <= 0n) continue;
    const credit = (remaining < outstanding ? remaining : outstanding) as Kobo;
    allocations.push({ installmentId: inst.id, amountKobo: credit });
    remaining = (remaining - credit) as Kobo;
  }

  return { allocations, remainderKobo: remaining as Kobo };
}
```

- [ ] **Step 5: Write packages/shared/src/payments/index.ts**

```ts
export * from './allocate.js';
export type * from './types.js';
```

- [ ] **Step 6: Run — expect PASS**

```bash
cd packages/shared && pnpm test -- allocate; cd ../..
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/payments
git commit -m "feat(shared): payments/allocatePayment pure allocation logic"
```

---

### Task 22: tenant/ — TenantContext + role helpers

**Files:**
- Create: `packages/shared/src/tenant/context.ts`
- Create: `packages/shared/src/tenant/role.ts`
- Create: `packages/shared/src/tenant/index.ts`
- Create: `packages/shared/src/tenant/__tests__/role.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/tenant/__tests__/role.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { hasRole, requireRole, type TenantContext } from '../index.js';

const baseCtx = (role: 'OWNER' | 'ADMIN' | 'STAFF'): TenantContext => ({
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-000000000010',
    authUserId: '01935b7e-0000-7000-8000-000000000020',
    role,
    email: 'u@example.com',
    mustChangePassword: false,
  },
});

describe('role helpers', () => {
  test('hasRole — OWNER matches OWNER allow-list', () => {
    expect(hasRole(baseCtx('OWNER'), ['OWNER'])).toBe(true);
  });

  test('hasRole — STAFF rejected from OWNER allow-list', () => {
    expect(hasRole(baseCtx('STAFF'), ['OWNER'])).toBe(false);
  });

  test('hasRole — ADMIN matches when allow-list includes ADMIN', () => {
    expect(hasRole(baseCtx('ADMIN'), ['OWNER', 'ADMIN'])).toBe(true);
  });

  test('requireRole — passes silently when role is allowed', () => {
    expect(() => requireRole(baseCtx('OWNER'), ['OWNER'])).not.toThrow();
  });

  test('requireRole — throws ForbiddenError when not allowed', () => {
    expect(() => requireRole(baseCtx('STAFF'), ['OWNER'])).toThrow(/Forbidden/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/shared && pnpm test -- role; cd ../..
```

- [ ] **Step 3: Write packages/shared/src/tenant/context.ts**

```ts
export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF';

export type TenantContext = {
  tenantId: string;
  user: {
    id: string;
    authUserId: string;
    role: UserRole;
    email: string;
    mustChangePassword: boolean;
  };
};
```

- [ ] **Step 4: Write packages/shared/src/tenant/role.ts**

```ts
import type { TenantContext, UserRole } from './context.js';

export class ForbiddenError extends Error {
  constructor(required: UserRole[], actual: UserRole) {
    super(`Forbidden: required one of [${required.join(', ')}], actor has ${actual}`);
    this.name = 'ForbiddenError';
  }
}

export function hasRole(ctx: TenantContext, allowed: UserRole[]): boolean {
  return allowed.includes(ctx.user.role);
}

export function requireRole(ctx: TenantContext, allowed: UserRole[]): void {
  if (!hasRole(ctx, allowed)) throw new ForbiddenError(allowed, ctx.user.role);
}
```

- [ ] **Step 5: Write packages/shared/src/tenant/index.ts**

```ts
export * from './context.js';
export * from './role.js';
```

- [ ] **Step 6: Update packages/shared/src/index.ts**

```ts
export * as installments from './installments/index.js';
export * as money from './money/index.js';
export * as payments from './payments/index.js';
export * as tenant from './tenant/index.js';
export type { TenantContext, UserRole } from './tenant/context.js';
```

- [ ] **Step 7: Run — expect PASS**

```bash
cd packages/shared && pnpm test -- role; cd ../..
```

- [ ] **Step 8: Run the full shared test suite to verify nothing regressed**

```bash
cd packages/shared && pnpm test; cd ../..
```

Expected: all tests across `money/`, `installments/`, `payments/`, `tenant/` pass.

- [ ] **Step 9: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): tenant/context type and role helpers"
```

---

### Task 23: Drift integration test for `Installment.amountPaidKobo`

**Files:**
- Create: `packages/db/__tests__/drift-amountpaid.integration.test.ts`
- Create: `packages/db/src/payments-service.ts` (minimal service used by the test)
- Modify: `packages/db/src/index.ts`

The spec (§9.3) requires an integration test that records payments through a service-layer function and asserts the denormalized `Installment.amountPaidKobo` matches the sum of `PaymentAllocation` rows. This task creates a minimal `recordPayment` service function in `@solutio/db` so the contract is testable without waiting for the full UI to exist.

- [ ] **Step 1: Write packages/db/src/payments-service.ts**

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import { allocatePayment } from '../../shared/src/payments/allocate.js';
import type { Kobo } from '../../shared/src/money/types.js';
import type { TenantContext } from '../../shared/src/tenant/context.js';
import { deriveInstallmentStatus } from '../../shared/src/installments/status.js';
import { forTenant } from './tenant-client.js';

export type RecordPaymentInput = {
  planId: string;
  amountKobo: Kobo;
  paidAt: Date;
  method: 'CASH' | 'TRANSFER' | 'CHEQUE' | 'CARD_MANUAL' | 'OTHER';
  reference?: string;
  notes?: string;
};

/**
 * Service function — records a Payment, computes allocations across the Plan's
 * outstanding installments, persists them, updates the denormalized
 * Installment.amountPaidKobo running total, and refreshes Installment.status.
 * All writes happen in a single SERIALIZABLE transaction.
 */
export async function recordPayment(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: RecordPaymentInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const txScoped = forTenant(tx as unknown as PrismaClient, ctx.tenantId);

      const installments = await txScoped.installment.findMany({
        where: { planId: input.planId },
        orderBy: { sequenceNo: 'asc' },
      });

      const result = allocatePayment(
        input.amountKobo,
        installments.map((i) => ({
          id: i.id,
          sequenceNo: i.sequenceNo,
          amountDueKobo: i.amountDueKobo as Kobo,
          amountPaidKobo: i.amountPaidKobo as Kobo,
        })),
      );

      const payment = await txScoped.payment.create({
        data: {
          planId: input.planId,
          amountKobo: input.amountKobo,
          paidAt: input.paidAt,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedBy: ctx.user.id,
        },
      });

      const today = new Date();
      for (const alloc of result.allocations) {
        await txScoped.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            installmentId: alloc.installmentId,
            amountKobo: alloc.amountKobo,
          },
        });
        const inst = installments.find((i) => i.id === alloc.installmentId)!;
        const newPaid = (inst.amountPaidKobo + alloc.amountKobo) as Kobo;
        const newStatus = deriveInstallmentStatus({
          amountDueKobo: inst.amountDueKobo as Kobo,
          amountPaidKobo: newPaid,
          dueDate: inst.dueDate,
          currentStatus: inst.status,
          today,
        });
        await txScoped.installment.update({
          where: { id: alloc.installmentId },
          data: { amountPaidKobo: newPaid, status: newStatus },
        });
      }

      return { payment, allocations: result.allocations, remainderKobo: result.remainderKobo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
```

- [ ] **Step 2: Update packages/db/src/index.ts to export recordPayment**

```ts
export { prisma } from './client.js';
export { forTenant, CrossTenantWriteError } from './tenant-client.js';
export type { TenantPrismaClient } from './tenant-client.js';
export { recordPayment } from './payments-service.js';
export type { RecordPaymentInput } from './payments-service.js';
export type * from '@prisma/client';
```

- [ ] **Step 3: Write the drift test**

Create `packages/db/__tests__/drift-amountpaid.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import { forTenant } from '../src/tenant-client.js';
import { recordPayment } from '../src/payments-service.js';
import { generateSchedule } from '../../shared/src/installments/schedule.js';
import { koboFromNaira, type Kobo } from '../../shared/src/money/index.js';
import type { TenantContext } from '../../shared/src/tenant/context.js';

let pg: TestPostgres;
let planId: string;
let tenantId: string;
let userId: string;

const ctx = (): TenantContext => ({
  tenantId,
  user: {
    id: userId,
    authUserId: '01935b7e-0000-7000-8000-AAAAAAAAAAA1',
    role: 'OWNER',
    email: 'owner@atrium.test',
    mustChangePassword: false,
  },
});

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.stop();
});

beforeEach(async () => {
  // Reset state — drop and re-seed minimal fixture for each test
  await pg.prisma.paymentAllocation.deleteMany();
  await pg.prisma.payment.deleteMany();
  await pg.prisma.installment.deleteMany();
  await pg.prisma.plan.deleteMany();
  await pg.prisma.property.deleteMany();
  await pg.prisma.customer.deleteMany();
  await pg.prisma.user.deleteMany();
  await pg.prisma.tenant.deleteMany();

  const tenant = await pg.prisma.tenant.create({
    data: { slug: 'atrium-homes', name: 'Atrium Homes' },
  });
  tenantId = tenant.id;
  const user = await pg.prisma.user.create({
    data: {
      tenantId,
      authUserId: '01935b7e-0000-7000-8000-AAAAAAAAAAA1',
      email: 'owner@atrium.test',
      name: 'Owner',
      role: 'OWNER',
    },
  });
  userId = user.id;

  const customer = await pg.prisma.customer.create({
    data: { tenantId, fullName: 'Test Customer', phone: '+2348012340000' },
  });
  const property = await pg.prisma.property.create({
    data: {
      tenantId,
      code: 'ATR-001',
      title: 'Test Property',
      addressLine: '1 Street',
      city: 'Lekki',
      totalPriceKobo: koboFromNaira(12_000_000),
    },
  });
  const plan = await pg.prisma.plan.create({
    data: {
      tenantId,
      customerId: customer.id,
      propertyId: property.id,
      totalPriceKobo: koboFromNaira(12_000_000),
      depositKobo: koboFromNaira(2_400_000),
      monthlyKobo: koboFromNaira(800_000),
      termMonths: 12,
      startDate: new Date('2026-06-01T00:00:00Z'),
      status: 'ACTIVE',
    },
  });
  planId = plan.id;

  const rows = generateSchedule({
    totalPriceKobo: koboFromNaira(12_000_000),
    depositKobo: koboFromNaira(2_400_000),
    monthlyKobo: koboFromNaira(800_000),
    termMonths: 12,
    startDate: new Date('2026-06-01T00:00:00Z'),
  });
  await pg.prisma.installment.createMany({
    data: rows.map((r) => ({
      tenantId,
      planId,
      sequenceNo: r.sequenceNo,
      dueDate: r.dueDate,
      amountDueKobo: r.amountDueKobo,
    })),
  });
});

async function assertNoDrift() {
  const installments = await pg.prisma.installment.findMany({ where: { planId } });
  for (const inst of installments) {
    const sum = await pg.prisma.paymentAllocation.aggregate({
      where: { installmentId: inst.id },
      _sum: { amountKobo: true },
    });
    const allocated = (sum._sum.amountKobo ?? 0n) as bigint;
    expect(
      inst.amountPaidKobo,
      `drift on installment seq=${inst.sequenceNo}: amountPaidKobo=${inst.amountPaidKobo} but SUM(allocations)=${allocated}`,
    ).toBe(allocated);
  }
}

describe('amountPaidKobo denormalization drift', () => {
  test('single payment exactly covering deposit', async () => {
    await recordPayment(pg.prisma, ctx(), {
      planId,
      amountKobo: koboFromNaira(2_400_000) as Kobo,
      paidAt: new Date(),
      method: 'TRANSFER',
    });
    await assertNoDrift();
  });

  test('payment spanning deposit + first two monthlies', async () => {
    await recordPayment(pg.prisma, ctx(), {
      planId,
      amountKobo: koboFromNaira(4_000_000) as Kobo,
      paidAt: new Date(),
      method: 'TRANSFER',
    });
    await assertNoDrift();
  });

  test('overpayment leaves remainder; no drift', async () => {
    // Total plan = 12M. Pay 20M.
    const result = await recordPayment(pg.prisma, ctx(), {
      planId,
      amountKobo: koboFromNaira(20_000_000) as Kobo,
      paidAt: new Date(),
      method: 'CHEQUE',
      reference: 'CHQ-001',
    });
    expect(result.remainderKobo).toBe(koboFromNaira(8_000_000));
    await assertNoDrift();
  });

  test('many small payments — every installment touched', async () => {
    for (let i = 0; i < 13; i++) {
      await recordPayment(pg.prisma, ctx(), {
        planId,
        amountKobo: koboFromNaira(900_000) as Kobo,
        paidAt: new Date(),
        method: 'CASH',
      });
    }
    await assertNoDrift();
  });
});
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd packages/db && pnpm test:integration -- drift-amountpaid; cd ../..
```

Expected: all four scenarios pass; `assertNoDrift()` confirms denormalized totals match the allocation sums.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/payments-service.ts packages/db/src/index.ts packages/db/__tests__/drift-amountpaid.integration.test.ts
git commit -m "feat(db): recordPayment service with drift-free denormalization"
```

---

## Phase D — Auth & Tenant Resolution

### Task 24: apps/web scaffold (Next.js, pinned)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/.eslintrc.cjs`

**Prerequisite:** `<NEXT_VERSION>`, `<REACT_VERSION>`, `<REACT_DOM_VERSION>`, `<TYPES_REACT_VERSION>`, `<TYPES_REACT_DOM_VERSION>`, `<TYPES_NODE_VERSION>`, `<TAILWIND_VERSION>`, `<BETTER_AUTH_VERSION>` from `/tmp/solutio-versions.txt`.

- [ ] **Step 1: Create directories**

```bash
mkdir -p apps/web/app apps/web/lib apps/web/server-actions apps/web/e2e
```

- [ ] **Step 2: Write apps/web/package.json**

```json
{
  "name": "@solutio/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@solutio/db": "workspace:*",
    "@solutio/shared": "workspace:*",
    "better-auth": "<BETTER_AUTH_VERSION>",
    "next": "<NEXT_VERSION>",
    "react": "<REACT_VERSION>",
    "react-dom": "<REACT_DOM_VERSION>",
    "zod": "<ZOD_VERSION>"
  },
  "devDependencies": {
    "@solutio/config": "workspace:*",
    "@playwright/test": "<PLAYWRIGHT_VERSION>",
    "@types/node": "<TYPES_NODE_VERSION>",
    "@types/react": "<TYPES_REACT_VERSION>",
    "@types/react-dom": "<TYPES_REACT_DOM_VERSION>",
    "autoprefixer": "<AUTOPREFIXER_VERSION>",
    "postcss": "<POSTCSS_VERSION>",
    "tailwindcss": "<TAILWIND_VERSION>",
    "typescript": "<TYPESCRIPT_VERSION>",
    "vitest": "<VITEST_VERSION>"
  }
}
```

(Run `npm view autoprefixer version` and `npm view postcss version` to fill those two; record in `/tmp/solutio-versions.txt`.)

- [ ] **Step 3: Write apps/web/tsconfig.json**

```json
{
  "extends": "@solutio/config/tsconfig/base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules", "e2e"]
}
```

- [ ] **Step 4: Write apps/web/next.config.ts**

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
};

export default config;
```

- [ ] **Step 5: Write apps/web/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web-unit',
    include: ['**/__tests__/*.test.ts', '**/__tests__/*.test.tsx'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: Write apps/web/.eslintrc.cjs**

```js
module.exports = {
  root: false,
  extends: ['@solutio/config/eslint', 'next/core-web-vitals'],
};
```

- [ ] **Step 7: Write apps/web/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
}

body {
  @apply bg-white text-slate-900 antialiased;
}
```

- [ ] **Step 8: Write apps/web/app/layout.tsx**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solutio Installments',
  description: 'Track property installment plans',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Install dependencies and verify typecheck**

```bash
pnpm install
cd apps/web && pnpm typecheck; cd ../..
```

Expected: `pnpm install` produces `pnpm-lock.yaml`. `pnpm typecheck` may emit Next.js-not-yet-built warnings — that's fine; the only failure mode we care about is a TS-level error in our own files.

- [ ] **Step 10: Commit lockfile and scaffold**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Next.js scaffold with pinned deps and shared eslint extension"
```

---

### Task 25: Better Auth wiring with multiSchema

**Files:**
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/api/auth/[...all]/route.ts`
- Modify: `packages/db/prisma/schema.prisma` (add Better Auth models in the `auth` schema)
- Create new migration: `packages/db/prisma/migrations/0002_better_auth/migration.sql`

Better Auth's Prisma adapter expects four models: `user`, `session`, `account`, `verification`. We declare them inside the `auth` schema using Prisma's `@@schema` directive.

- [ ] **Step 1: Append Better Auth models to packages/db/prisma/schema.prisma**

```prisma
// ─── Better Auth tables ──────────────────────────────────────────────
// These live in the `auth` schema and are managed by Better Auth's adapter.
// Domain `User.authUserId` references AuthUser.id.

model AuthUser {
  id            String    @id @db.Uuid
  email         String    @unique
  emailVerified Boolean   @default(false)
  name          String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions Session[]
  accounts Account[]

  @@map("user")
  @@schema("auth")
}

model Session {
  id        String   @id @db.Uuid
  userId    String   @db.Uuid
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
  @@schema("auth")
}

model Account {
  id                    String    @id @db.Uuid
  userId                String    @db.Uuid
  providerId            String
  accountId             String
  password              String?
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("account")
  @@schema("auth")
}

model Verification {
  id         String    @id @db.Uuid
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@map("verification")
  @@schema("auth")
}
```

- [ ] **Step 2: Generate the migration**

```bash
cd packages/db && pnpm prisma migrate dev --create-only --name better_auth; cd ../..
```

Expected: `prisma/migrations/0002_better_auth/migration.sql` created with `CREATE TABLE auth.user`, `auth.session`, `auth.account`, `auth.verification`.

- [ ] **Step 3: Inspect the migration**

Open the generated SQL file and confirm all four tables are created in `auth.*` (not `public.*`).

- [ ] **Step 4: Write apps/web/lib/auth.ts**

```ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@solutio/db/client';
import type { SeedAuthAdapter } from '@solutio/db/seed';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: '__Host-solutio',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
});

export type Auth = typeof auth;

/**
 * Adapter used by the seed script to ensure the OWNER Better Auth user exists.
 * Idempotent: if the email already has an auth user, returns the existing id.
 */
export function createSeedAuthAdapter(): SeedAuthAdapter {
  return {
    async ensureOwnerAuthUser(email: string, password: string) {
      const existing = await prisma.authUser.findUnique({ where: { email } });
      if (existing) return { authUserId: existing.id };
      const signupResult = await auth.api.signUpEmail({
        body: { email, password, name: 'Atrium Owner' },
        headers: new Headers(),
      });
      if (!signupResult.user) {
        throw new Error(`Better Auth signup failed for ${email}`);
      }
      return { authUserId: signupResult.user.id };
    },
  };
}
```

- [ ] **Step 5: Write apps/web/app/api/auth/[...all]/route.ts**

```ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 6: Typecheck and run prisma:diff**

```bash
cd apps/web && pnpm typecheck; cd ../..
cd packages/db && pnpm prisma:diff; cd ../..
```

Expected: typecheck passes; `prisma:diff` shows no drift (the new migration matches the schema).

- [ ] **Step 7: Commit**

```bash
git add packages/db apps/web/lib/auth.ts apps/web/app/api
git commit -m "feat(auth): Better Auth wired to Prisma adapter in auth schema"
```

---

### Task 26: Login page + server action

**Files:**
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/server-actions/login.ts`

- [ ] **Step 1: Write apps/web/server-actions/login.ts**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Please enter a valid email and password.' };
  }

  try {
    await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (err) {
    return { error: 'Invalid email or password.' };
  }
  redirect('/');
}
```

- [ ] **Step 2: Write apps/web/app/login/page.tsx**

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/server-actions/login';

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to Solutio</h1>
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        ) : null}
        <SubmitButton />
      </form>
    </main>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck; cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/login apps/web/server-actions/login.ts
git commit -m "feat(web): login page with Better Auth signInEmail server action"
```

---

### Task 27: getTenantContext() at the resolver boundary

**Files:**
- Create: `apps/web/lib/tenant-context.ts`

- [ ] **Step 1: Write apps/web/lib/tenant-context.ts**

```ts
import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from './auth';
import { prisma } from '@solutio/db/client';
import type { TenantContext } from '@solutio/shared/tenant';

/**
 * Resolves the request's TenantContext. React `cache()` deduplicates calls
 * within a single request. Returns null if the user is not authenticated or
 * has no domain User row.
 *
 * IMPORTANT: This function is the *only* sanctioned consumer of headers() and
 * the raw Prisma client for auth purposes. Service functions in
 * packages/shared/** must NEVER import this — they take ctx as an explicit
 * first parameter. See spec §6.5.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const domainUser = await prisma.user.findUnique({
    where: { authUserId: session.user.id },
    select: {
      id: true,
      authUserId: true,
      tenantId: true,
      role: true,
      email: true,
      mustChangePassword: true,
    },
  });
  if (!domainUser) return null;

  return {
    tenantId: domainUser.tenantId,
    user: {
      id: domainUser.id,
      authUserId: domainUser.authUserId,
      role: domainUser.role,
      email: domainUser.email,
      mustChangePassword: domainUser.mustChangePassword,
    },
  };
});
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck; cd ../..
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/tenant-context.ts
git commit -m "feat(auth): getTenantContext() resolver with React cache memoization"
```

---

### Task 28: Verify ESLint restricted-imports actively enforces the boundary

This task does not add code — it confirms the rule from Task 4 actually fires. If it doesn't, the rule is silently ignored.

- [ ] **Step 1: Create a temporary file inside packages/shared that should be rejected**

```bash
cat > packages/shared/src/installments/__violates__.ts << 'TS'
// This file deliberately violates the ESLint rule. It must be rejected.
import { getTenantContext } from '../../../../apps/web/lib/tenant-context';
export const _smuggled = getTenantContext;
TS
```

- [ ] **Step 2: Run lint — expect the rule to flag the violation**

```bash
cd packages/shared && npx eslint src/installments/__violates__.ts || echo "RULE FIRED (expected)"; cd ../..
```

Expected output includes `getTenantContext()` import is restricted, plus the message from `packages/config/eslint/index.js`.

- [ ] **Step 3: Remove the violation file**

```bash
rm packages/shared/src/installments/__violates__.ts
```

- [ ] **Step 4: No commit** — verification only.

---

### Task 29: Authenticated layout RSC with `mustChangePassword` gate

**Files:**
- Create: `apps/web/app/(authenticated)/layout.tsx`
- Create: `apps/web/app/(authenticated)/page.tsx` (placeholder home — final content in Task 32)

- [ ] **Step 1: Write apps/web/app/(authenticated)/layout.tsx**

```tsx
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  if (ctx.user.mustChangePassword) redirect('/onboarding/change-password');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 px-6 py-3 text-sm">
        Signed in as <span className="font-medium">{ctx.user.email}</span>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write apps/web/app/(authenticated)/page.tsx** (placeholder)

```tsx
export default function HomePage() {
  return (
    <main className="px-6 py-8">
      <h1 className="text-xl font-semibold">Welcome to Solutio</h1>
      <p className="mt-2 text-sm text-slate-600">Phase 0 — authenticated home.</p>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck; cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/app/(authenticated)'
git commit -m "feat(auth): authenticated layout with mustChangePassword RSC gate"
```

---

### Task 30: Onboarding route group + change-password flow

**Files:**
- Create: `apps/web/app/(onboarding)/layout.tsx`
- Create: `apps/web/app/(onboarding)/change-password/page.tsx`
- Create: `apps/web/server-actions/change-password.ts`

The onboarding layout authenticates but does NOT enforce the `mustChangePassword` gate — otherwise the redirect loops forever.

- [ ] **Step 1: Write apps/web/server-actions/change-password.ts**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getTenantContext } from '@/lib/tenant-context';
import { forTenant, prisma } from '@solutio/db';

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordState = { error?: string };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = schema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const reqHeaders = await headers();
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: reqHeaders,
    });
  } catch {
    return { error: 'Current password is incorrect.' };
  }

  // Clear the flag through the tenant-scoped client — never the raw client.
  // Better Auth's password update has already committed; we never want a
  // state where the password changed but mustChangePassword is still true.
  // If this update fails, the user is asked to retry; the new password is
  // already valid for their next login.
  const db = forTenant(prisma, ctx.tenantId);
  await db.user.update({
    where: { id: ctx.user.id },
    data: { mustChangePassword: false },
  });

  redirect('/');
}
```

- [ ] **Step 2: Write apps/web/app/(onboarding)/layout.tsx**

```tsx
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  // Intentional: this layout does NOT enforce the mustChangePassword gate —
  // /onboarding/change-password is the destination of that redirect.
  return <div className="min-h-screen">{children}</div>;
}
```

- [ ] **Step 3: Write apps/web/app/(onboarding)/change-password/page.tsx**

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePasswordAction, type ChangePasswordState } from '@/server-actions/change-password';

const initialState: ChangePasswordState = {};

export default function ChangePasswordPage() {
  const [state, formAction] = useFormState(changePasswordAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-slate-600">
        For your first login, you must replace your seed password.
      </p>
      <form action={formAction} className="space-y-4">
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField name="newPassword" label="New password (min 12 chars)" autoComplete="new-password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        ) : null}
        <SubmitButton />
      </form>
    </main>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      <input
        type="password"
        name={name}
        required
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
    >
      {pending ? 'Updating…' : 'Update password'}
    </button>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && pnpm typecheck; cd ../..
```

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/app/(onboarding)' apps/web/server-actions/change-password.ts
git commit -m "feat(auth): /onboarding/change-password with gate-exempt layout"
```

---

## Phase E — Minimal App Shell (just enough for AC #2)

### Task 31: Health endpoint

**Files:**
- Create: `apps/web/app/api/health/route.ts`
- Create: `apps/web/app/api/health/__tests__/route.test.ts`

The health endpoint must (a) succeed when the DB is reachable, (b) fail loudly when not. Kubernetes uses it for readiness and liveness probes.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/health/__tests__/route.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('@solutio/db/client', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

describe('GET /api/health', () => {
  test('returns 200 with status ok when DB responds', async () => {
    const { GET } = await import('../route.js');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (route file missing)

```bash
cd apps/web && pnpm test -- health; cd ../..
```

- [ ] **Step 3: Write apps/web/app/api/health/route.ts**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@solutio/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd apps/web && pnpm test -- health; cd ../..
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/health
git commit -m "feat(web): /api/health endpoint for k8s probes"
```

---

### Task 32: Authenticated home page

**Files:**
- Modify: `apps/web/app/(authenticated)/page.tsx`
- Create: `apps/web/server-actions/sign-out.ts`

- [ ] **Step 1: Write apps/web/server-actions/sign-out.ts**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}
```

- [ ] **Step 2: Replace apps/web/app/(authenticated)/page.tsx**

```tsx
import { getTenantContext } from '@/lib/tenant-context';
import { signOutAction } from '@/server-actions/sign-out';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Welcome to Solutio</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as <span className="font-medium">{ctx.user.email}</span> ({ctx.user.role}).
      </p>
      <p className="mt-4 text-sm text-slate-600">
        Phase 0 is a foundation deploy — the customer, property, plan, and payment UIs
        land in Phase 1.
      </p>
      <form action={signOutAction} className="mt-8">
        <button
          type="submit"
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck; cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/app/(authenticated)/page.tsx' apps/web/server-actions/sign-out.ts
git commit -m "feat(web): authenticated home page with sign-out"
```

---

### Task 33: Tailwind + postcss config

**Files:**
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`

- [ ] **Step 1: Write apps/web/tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Write apps/web/postcss.config.js**

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: Build the app to confirm everything wires together**

```bash
cd apps/web && pnpm build; cd ../..
```

Expected: `▲ Next.js` builds successfully, `standalone` output emitted, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/postcss.config.js
git commit -m "feat(web): tailwind + postcss configured"
```

---

## Phase F — Deploy Pipeline

### Task 34: apps/web Dockerfile

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/.dockerignore`

**Prerequisite:** `<NODE_DIGEST>` (from `crane digest node:<NODE_VERSION>-bookworm-slim`), `<DISTROLESS_DIGEST>` (from `crane digest gcr.io/distroless/nodejs24-debian12:latest`), `<PNPM_VERSION>`. All values must be the verified outputs from `/tmp/solutio-versions.txt`.

- [ ] **Step 1: Write apps/web/.dockerignore**

```
**/node_modules
**/.next
**/dist
**/coverage
**/.turbo
**/.git
**/.env*
**/test-results
**/playwright-report
**/e2e
.github
docs
deploy
scripts
```

- [ ] **Step 2: Write apps/web/Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.7

# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:<NODE_VERSION>-bookworm-slim@sha256:<NODE_DIGEST> AS deps
WORKDIR /app
ENV CI=1 PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@<PNPM_VERSION> --activate

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm --filter @solutio/db prisma generate
RUN pnpm --filter @solutio/web build

# ── Stage 3: distroless runtime ───────────────────────────────────────────────
FROM gcr.io/distroless/nodejs24-debian12@sha256:<DISTROLESS_DIGEST> AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
USER nonroot

COPY --from=build --chown=nonroot:nonroot /app/apps/web/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nonroot:nonroot /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["apps/web/server.js"]
```

- [ ] **Step 3: Run the FROM guard against the new Dockerfile**

```bash
bash scripts/check-no-unpinned-from.sh
```

Expected: `PASS: all Dockerfile FROM lines are SHA-pinned`.

- [ ] **Step 4: Build locally to confirm the Dockerfile is valid**

```bash
docker build -t solutio-web:local -f apps/web/Dockerfile .
```

Expected: build succeeds, image tagged `solutio-web:local`. If your local machine isn't amd64, add `--platform linux/amd64` (slower; only needed for verification).

- [ ] **Step 5: Commit**

```bash
git add apps/web/Dockerfile apps/web/.dockerignore
git commit -m "feat(deploy): multi-stage Dockerfile with SHA-pinned base images"
```

---

### Task 35: CNPG Cluster CR

**Files:**
- Create: `deploy/k8s/cnpg/cluster.yaml`
- Create: `deploy/k8s/cnpg/kustomization.yaml`

**Prerequisite:** `<CNPG_PG_DIGEST>` from `crane digest ghcr.io/cloudnative-pg/postgresql:18.3-bookworm`.

You also need to know your cluster's existing default `StorageClass` name (replace `<STORAGE_CLASS>`). Run `kubectl get storageclass` to find it.

- [ ] **Step 1: Create directory**

```bash
mkdir -p deploy/k8s/cnpg
```

- [ ] **Step 2: Write deploy/k8s/cnpg/cluster.yaml**

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: solutio-pg
  namespace: solutio-prod
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:18.3-bookworm@sha256:<CNPG_PG_DIGEST>
  bootstrap:
    initdb:
      database: solutio
      owner: solutio
      postInitSQL:
        - CREATE SCHEMA IF NOT EXISTS auth
        - GRANT ALL ON SCHEMA auth TO solutio
  storage:
    size: 20Gi
    storageClass: <STORAGE_CLASS>
  monitoring:
    enablePodMonitor: true
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: "1"
      memory: 1Gi
  postgresql:
    parameters:
      max_connections: "100"
      shared_buffers: 256MB
  affinity:
    podAntiAffinityType: preferred
```

- [ ] **Step 3: Write deploy/k8s/cnpg/kustomization.yaml**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: solutio-prod
resources:
  - cluster.yaml
```

- [ ] **Step 4: Validate with kustomize**

```bash
kubectl kustomize deploy/k8s/cnpg/ > /tmp/cnpg-rendered.yaml
head -20 /tmp/cnpg-rendered.yaml
```

Expected: rendered YAML has `kind: Cluster`, `imageName` with `@sha256:`, the two `postInitSQL` statements.

- [ ] **Step 5: Commit**

```bash
git add deploy/k8s/cnpg
git commit -m "feat(deploy): CNPG Cluster CR with auth-schema postInitSQL and PG 18.3 pinned"
```

---

### Task 36: Sealed Secrets manifests

**Files:**
- Create: `deploy/k8s/secrets/kustomization.yaml`
- Create: `deploy/k8s/secrets/solutio-db.sealedsecret.yaml`
- Create: `deploy/k8s/secrets/solutio-auth.sealedsecret.yaml`
- Create: `deploy/k8s/secrets/solutio-seed.sealedsecret.yaml`
- Create: `deploy/k8s/secrets/.gitkeep-sealed`
- Create: `scripts/seal-secrets.sh` (helper for re-sealing)

**Prerequisite:** kubeseal CLI installed and your cluster's sealed-secrets-controller running. Confirm with `kubectl -n kube-system get pods -l app.kubernetes.io/name=sealed-secrets`.

- [ ] **Step 1: Create directory**

```bash
mkdir -p deploy/k8s/secrets
```

- [ ] **Step 2: Write scripts/seal-secrets.sh**

```bash
#!/usr/bin/env bash
# Reseals secrets from a local plaintext input file.
# Usage: scripts/seal-secrets.sh <plaintext-yaml> <output-sealedsecret-yaml>
# The plaintext file is NEVER committed.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <plaintext-yaml> <output-sealedsecret-yaml>" >&2
  exit 1
fi

PLAINTEXT="$1"
OUTPUT="$2"

kubeseal \
  --controller-namespace kube-system \
  --controller-name sealed-secrets-controller \
  --format yaml \
  < "$PLAINTEXT" > "$OUTPUT"

echo "Sealed: $PLAINTEXT -> $OUTPUT"
```

```bash
chmod +x scripts/seal-secrets.sh
```

- [ ] **Step 3: Create plaintext secret templates in /tmp (NEVER commit these)**

```bash
cat > /tmp/solutio-db.secret.yaml << 'YAML'
apiVersion: v1
kind: Secret
metadata:
  name: solutio-db
  namespace: solutio-prod
type: Opaque
stringData:
  DATABASE_URL: "postgresql://solutio:REPLACE_ME@solutio-pg-rw.solutio-prod.svc.cluster.local:5432/solutio?schema=public"
YAML

cat > /tmp/solutio-auth.secret.yaml << 'YAML'
apiVersion: v1
kind: Secret
metadata:
  name: solutio-auth
  namespace: solutio-prod
type: Opaque
stringData:
  BETTER_AUTH_SECRET: "REPLACE_ME_WITH_64_HEX_CHARS"
  BETTER_AUTH_URL: "https://solutio.toyintest.org"
YAML

cat > /tmp/solutio-seed.secret.yaml << 'YAML'
apiVersion: v1
kind: Secret
metadata:
  name: solutio-seed
  namespace: solutio-prod
type: Opaque
stringData:
  SEED_OWNER_EMAIL: "owner@atrium-homes.test"
  SEED_OWNER_PASSWORD: "REPLACE_ME_STRONG_PASSWORD"
  SEED_OWNER_NAME: "Atrium Owner"
YAML
```

Replace each `REPLACE_ME` value. For the DB password, get the live value from `kubectl -n solutio-prod get secret solutio-pg-app -o jsonpath='{.data.password}' | base64 -d` AFTER the CNPG cluster is deployed (so first-pass run with a placeholder is OK; you'll re-seal once CNPG is up). For `BETTER_AUTH_SECRET`, run `openssl rand -hex 32`.

- [ ] **Step 4: Seal each into committed manifests**

```bash
bash scripts/seal-secrets.sh /tmp/solutio-db.secret.yaml deploy/k8s/secrets/solutio-db.sealedsecret.yaml
bash scripts/seal-secrets.sh /tmp/solutio-auth.secret.yaml deploy/k8s/secrets/solutio-auth.sealedsecret.yaml
bash scripts/seal-secrets.sh /tmp/solutio-seed.secret.yaml deploy/k8s/secrets/solutio-seed.sealedsecret.yaml
```

Expected: three sealed YAML files. Each will have `kind: SealedSecret` and an `encryptedData` block.

- [ ] **Step 5: Delete plaintexts**

```bash
rm /tmp/solutio-db.secret.yaml /tmp/solutio-auth.secret.yaml /tmp/solutio-seed.secret.yaml
```

- [ ] **Step 6: Write deploy/k8s/secrets/kustomization.yaml**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: solutio-prod
resources:
  - solutio-db.sealedsecret.yaml
  - solutio-auth.sealedsecret.yaml
  - solutio-seed.sealedsecret.yaml
```

- [ ] **Step 7: Verify the unsealed-secret guard still passes**

```bash
bash scripts/check-no-unsealed-secret.sh
```

Expected: `PASS: no unsealed Secret manifests under deploy/`

- [ ] **Step 8: Commit**

```bash
git add deploy/k8s/secrets scripts/seal-secrets.sh
git commit -m "feat(deploy): sealed secrets for db/auth/seed credentials"
```

---

### Task 37: Kustomize base for web Deployment

**Files:**
- Create: `deploy/k8s/web/deployment.yaml`
- Create: `deploy/k8s/web/service.yaml`
- Create: `deploy/k8s/web/ingress.yaml`
- Create: `deploy/k8s/web/hpa.yaml`
- Create: `deploy/k8s/web/kustomization.yaml`

**Prerequisite:** know your cluster's cert-manager `ClusterIssuer` name (replace `<CLUSTER_ISSUER>`) and ingress class (replace `<INGRESS_CLASS>`, e.g. `nginx` or `traefik`). The image initially deploys with a placeholder tag; ArgoCD Image Updater will overwrite `kustomization.yaml`'s `images:` block on first push to main (Task 40).

- [ ] **Step 1: Create directory**

```bash
mkdir -p deploy/k8s/web
```

- [ ] **Step 2: Write deploy/k8s/web/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: solutio-web
  namespace: solutio-prod
  labels: { app: solutio-web }
spec:
  replicas: 2
  selector:
    matchLabels: { app: solutio-web }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    metadata:
      labels: { app: solutio-web }
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: web
          image: repo.toyintest.org/solutio-web:placeholder
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
          envFrom:
            - secretRef: { name: solutio-db }
            - secretRef: { name: solutio-auth }
          readinessProbe:
            httpGet: { path: /api/health, port: http }
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /api/health, port: http }
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 6
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 1000m, memory: 768Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
```

- [ ] **Step 3: Write deploy/k8s/web/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: solutio-web
  namespace: solutio-prod
spec:
  type: ClusterIP
  selector: { app: solutio-web }
  ports:
    - name: http
      port: 80
      targetPort: http
```

- [ ] **Step 4: Write deploy/k8s/web/ingress.yaml**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: solutio-web
  namespace: solutio-prod
  annotations:
    cert-manager.io/cluster-issuer: "<CLUSTER_ISSUER>"
spec:
  ingressClassName: "<INGRESS_CLASS>"
  tls:
    - hosts: [solutio.toyintest.org]
      secretName: solutio-web-tls
  rules:
    - host: solutio.toyintest.org
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: solutio-web
                port: { number: 80 }
```

- [ ] **Step 5: Write deploy/k8s/web/hpa.yaml**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: solutio-web
  namespace: solutio-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: solutio-web
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
```

- [ ] **Step 6: Write deploy/k8s/web/kustomization.yaml**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: solutio-prod
resources:
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  - hpa.yaml
images:
  # ArgoCD Image Updater writes the live digest here. The placeholder ensures
  # `kubectl kustomize` validates the manifest until the first push to main.
  - name: repo.toyintest.org/solutio-web
    newTag: placeholder
```

- [ ] **Step 7: Validate the manifests render**

```bash
kubectl kustomize deploy/k8s/web/ > /tmp/web-rendered.yaml
grep -c 'kind:' /tmp/web-rendered.yaml
```

Expected: `4` (Deployment, Service, Ingress, HorizontalPodAutoscaler).

- [ ] **Step 8: Commit**

```bash
git add deploy/k8s/web
git commit -m "feat(deploy): Kustomize base for solutio-web — Deployment/Service/Ingress/HPA"
```

---

### Task 38: ArgoCD root and child Applications

**Files:**
- Create: `deploy/argocd/root-app.yaml`
- Create: `deploy/argocd/apps/cnpg-cluster.yaml`
- Create: `deploy/argocd/apps/solutio-secrets.yaml`
- Create: `deploy/argocd/apps/solutio-web.yaml`

**Prerequisite:** replace `<REPO_URL>` with the actual GitHub HTTPS URL (e.g. `https://github.com/toyinogunseinde/solutio`).

- [ ] **Step 1: Create directories**

```bash
mkdir -p deploy/argocd/apps
```

- [ ] **Step 2: Write deploy/argocd/root-app.yaml**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: solutio
  namespace: argocd
spec:
  project: default
  source:
    repoURL: <REPO_URL>
    path: deploy/argocd/apps
    targetRevision: main
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions:
      - CreateNamespace=false
```

- [ ] **Step 3: Write deploy/argocd/apps/cnpg-cluster.yaml**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: solutio-cnpg
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
spec:
  project: default
  source:
    repoURL: <REPO_URL>
    path: deploy/k8s/cnpg
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: solutio-prod
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

- [ ] **Step 4: Write deploy/argocd/apps/solutio-secrets.yaml**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: solutio-secrets
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "-5"
spec:
  project: default
  source:
    repoURL: <REPO_URL>
    path: deploy/k8s/secrets
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: solutio-prod
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 5: Write deploy/argocd/apps/solutio-web.yaml**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: solutio-web
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "0"
    # ArgoCD Image Updater configuration — watches the registry and writes the
    # resolved digest back into deploy/k8s/web/kustomization.yaml's images: block.
    argocd-image-updater.argoproj.io/image-list: "web=repo.toyintest.org/solutio-web"
    argocd-image-updater.argoproj.io/web.update-strategy: digest
    argocd-image-updater.argoproj.io/write-back-method: "git:secret:argocd/git-creds"
    argocd-image-updater.argoproj.io/write-back-target: "kustomization:deploy/k8s/web"
spec:
  project: default
  source:
    repoURL: <REPO_URL>
    path: deploy/k8s/web
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: solutio-prod
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 6: Commit**

```bash
git add deploy/argocd
git commit -m "feat(deploy): ArgoCD app-of-apps with image-updater on solutio-web"
```

**Manual install step (do once, not in CI):**
```bash
kubectl apply -n argocd -f deploy/argocd/root-app.yaml
```
The root Application is the only manifest applied by hand; everything else cascades.

---

### Task 39: GitHub Actions ci.yml

**Files:**
- Create: `.github/workflows/ci.yml`

**Prerequisite:** SHA pins for the actions you reference. For each `<ACTION>@<SHA>` placeholder below, look up the latest release commit on the action's GitHub releases page and pin to that 40-char SHA. Record the values in `/tmp/solutio-versions.txt`. Required: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`.

- [ ] **Step 1: Create directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write .github/workflows/ci.yml**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  guards:
    name: Pinning guards
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA>
      - run: bash scripts/check-no-caret.sh
      - run: bash scripts/check-no-unpinned-from.sh
      - run: bash scripts/check-no-unpinned-uses.sh
      - run: bash scripts/check-no-unsealed-secret.sh

  test:
    name: Lint + typecheck + test
    runs-on: ubuntu-latest
    needs: guards
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA>
      - uses: pnpm/action-setup@<PNPM_SETUP_SHA>
        with:
          version: <PNPM_VERSION>
      - uses: actions/setup-node@<SETUP_NODE_SHA>
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm --filter @solutio/db prisma generate
      - run: pnpm --filter @solutio/db prisma:validate
      - run: pnpm --filter @solutio/db prisma:diff
      - run: pnpm test --coverage.enabled --coverage.thresholds.lines=80 --coverage.thresholds.functions=80 --coverage.thresholds.branches=80 --coverage.thresholds.statements=80
      - name: Run integration tests
        run: pnpm test:integration
        env:
          # Testcontainers uses the host Docker daemon provided by the runner.
          TESTCONTAINERS_RYUK_DISABLED: "true"

  e2e:
    name: Playwright E2E
    runs-on: ubuntu-latest
    needs: test
    # E2E only runs on PRs targeting main (per spec memory note).
    if: github.event_name == 'pull_request' && github.base_ref == 'main'
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA>
      - uses: pnpm/action-setup@<PNPM_SETUP_SHA>
        with: { version: <PNPM_VERSION> }
      - uses: actions/setup-node@<SETUP_NODE_SHA>
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @solutio/web exec playwright install --with-deps chromium
      - run: pnpm --filter @solutio/web build
      - run: pnpm --filter @solutio/web test:e2e
```

- [ ] **Step 3: Run the uses-pin guard against the workflow**

```bash
bash scripts/check-no-unpinned-uses.sh
```

Expected: PASS once all `<*_SHA>` placeholders are replaced with real 40-char SHAs.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: PR + push CI with guards, typecheck, tests, coverage, integration"
```

---

### Task 40: GitHub Actions release.yml

**Files:**
- Create: `.github/workflows/release.yml`

**Prerequisite:** SHA pins for `docker/login-action`, `docker/setup-buildx-action`, `docker/build-push-action` in addition to checkout. Registry credentials stored as repo secrets `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.

- [ ] **Step 1: Write .github/workflows/release.yml**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  build-and-push:
    name: Build and push solutio-web
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA>
      - uses: docker/setup-buildx-action@<BUILDX_SHA>
      - uses: docker/login-action@<LOGIN_SHA>
        with:
          registry: repo.toyintest.org
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}
      - name: Build and push
        uses: docker/build-push-action@<BUILD_PUSH_SHA>
        with:
          context: .
          file: apps/web/Dockerfile
          platforms: linux/amd64
          push: true
          tags: |
            repo.toyintest.org/solutio-web:${{ github.sha }}
            repo.toyintest.org/solutio-web:main
          provenance: false
```

This workflow does NOT modify `deploy/k8s/` — ArgoCD Image Updater handles the manifest digest update.

- [ ] **Step 2: Run the uses-pin guard**

```bash
bash scripts/check-no-unpinned-uses.sh
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow builds and pushes solutio-web to repo.toyintest.org"
```

---

### Task 41: Pre-commit hook for unsealed Secrets

**Files:**
- Create: `.husky/pre-commit` (using simple-git-hooks pattern, no Husky dependency)

We use a tiny shell hook rather than Husky to keep dependency surface minimal — install once via `git config core.hooksPath`.

- [ ] **Step 1: Create the hook directory**

```bash
mkdir -p .githooks
```

- [ ] **Step 2: Write .githooks/pre-commit**

```bash
#!/usr/bin/env bash
set -euo pipefail
bash scripts/check-no-unsealed-secret.sh
bash scripts/check-no-caret.sh
```

```bash
chmod +x .githooks/pre-commit
```

- [ ] **Step 3: Add a setup script + README note**

Append to `README.md` (under "Local development", which becomes its proper section in Task 45):

```markdown
### One-time hook setup

After cloning:

```bash
git config core.hooksPath .githooks
```

The hook runs `scripts/check-no-unsealed-secret.sh` and `scripts/check-no-caret.sh` before every commit.
```

- [ ] **Step 4: Activate the hook in your local clone**

```bash
git config core.hooksPath .githooks
```

- [ ] **Step 5: Commit**

```bash
git add .githooks README.md
git commit -m "chore: pre-commit hook enforcing secret-seal and version-pin guards"
```

---

## Phase G — E2E, ADRs, README, Acceptance

### Task 42: Playwright happy-path E2E

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/happy-path.spec.ts`
- Create: `apps/web/e2e/_helpers/db-fixture.ts`

The E2E runs against a real container DB and a built `next start` server. It verifies acceptance criterion #2: login as seed owner → forced password change → land on authenticated home.

**Prerequisite:** `<PLAYWRIGHT_VERSION>`, `<POSTGRES_TC_DIGEST>`.

- [ ] **Step 1: Create directory**

```bash
mkdir -p apps/web/e2e/_helpers
```

- [ ] **Step 2: Write apps/web/playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @solutio/web start',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 3: Write apps/web/e2e/_helpers/db-fixture.ts**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import path from 'node:path';

const PG_IMAGE = 'postgres:18.3-bookworm@sha256:<POSTGRES_TC_DIGEST>';

export type E2EDb = {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  stop: () => Promise<void>;
};

export async function startE2EDatabase(): Promise<E2EDb> {
  const container = await new PostgreSqlContainer(PG_IMAGE)
    .withDatabase('solutio_e2e')
    .withUsername('solutio')
    .withPassword('solutio')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_SECRET = 'e2e-secret-do-not-use-anywhere-else-32hex';
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000';
  process.env.SEED_OWNER_EMAIL = 'owner@atrium.test';
  process.env.SEED_OWNER_PASSWORD = 'seedPassword!12345';
  process.env.SEED_OWNER_NAME = 'Atrium Owner';

  const repoRoot = path.resolve(__dirname, '../../../..');
  execSync('pnpm --filter @solutio/db prisma migrate deploy', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  execSync('pnpm --filter @solutio/db seed', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  return {
    container,
    databaseUrl,
    stop: async () => {
      await container.stop();
    },
  };
}
```

- [ ] **Step 4: Write apps/web/e2e/happy-path.spec.ts**

```ts
import { expect, test } from '@playwright/test';
import { startE2EDatabase, type E2EDb } from './_helpers/db-fixture.js';

let db: E2EDb;

test.beforeAll(async () => {
  db = await startE2EDatabase();
});

test.afterAll(async () => {
  await db?.stop();
});

test('seed owner logs in, is forced to change password, lands on home', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

  await page.getByLabel(/email/i).fill('owner@atrium.test');
  await page.getByLabel(/password/i).fill('seedPassword!12345');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/onboarding\/change-password$/);
  await expect(page.getByRole('heading', { name: /set a new password/i })).toBeVisible();

  await page.getByLabel(/current password/i).fill('seedPassword!12345');
  await page.getByLabel(/new password/i).fill('newStrongPassword!2026');
  await page.getByLabel(/confirm new password/i).fill('newStrongPassword!2026');
  await page.getByRole('button', { name: /update password/i }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /welcome to solutio/i })).toBeVisible();
  await expect(page.getByText('owner@atrium.test')).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 5: Run locally (requires Docker)**

```bash
cd apps/web && pnpm exec playwright install --with-deps chromium; cd ../..
cd apps/web && pnpm test:e2e; cd ../..
```

Expected: one test, passes. (Slow first run — building the app and pulling the PG image takes ~2 minutes.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(e2e): happy-path covering login → force change → home → sign out"
```

---

### Task 43: ADRs 0001–0005

**Files:**
- Create: `docs/adr/0001-monorepo-shape.md`
- Create: `docs/adr/0002-tenancy-row-level.md`
- Create: `docs/adr/0003-money-bigint-kobo.md`
- Create: `docs/adr/0004-ids-uuid-v7-native-pg18.md`
- Create: `docs/adr/0005-better-auth-separate-tables.md`

All ADRs follow the same template: Status, Context, Decision, Consequences. Each is 1 page max.

- [ ] **Step 1: Write docs/adr/0001-monorepo-shape.md**

```markdown
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
```

- [ ] **Step 2: Write docs/adr/0002-tenancy-row-level.md**

```markdown
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
```

- [ ] **Step 3: Write docs/adr/0003-money-bigint-kobo.md**

```markdown
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
```

- [ ] **Step 4: Write docs/adr/0004-ids-uuid-v7-native-pg18.md**

```markdown
# ADR 0004 — UUID v7 via PostgreSQL 18.3 native `uuidv7()`

**Status:** Accepted (2026-05-12)

## Context

We need primary keys that are (a) time-sortable for cheap "ORDER BY id" =
"ORDER BY created_at" semantics; (b) not sequence-leaking across tenants; (c)
generable without app round-trips.

## Decision

All IDs are `UUID v7` generated by Postgres 18.3's **native** `uuidv7()`
function. The CNPG cluster image is pinned to `ghcr.io/cloudnative-pg/postgresql:18.3-bookworm`
by SHA digest. No `pg_uuidv7` extension is used. The `uuidv7` npm package is
available as a fallback for tests and the rare case an ID must be generated
client-side, but the runtime path is DB-generated.

## Consequences

- Time-sortable IDs without extra columns.
- One less Postgres extension to install / upgrade / audit.
- Tied to PG ≥ 18; downgrading would require migration to a different default.
```

- [ ] **Step 5: Write docs/adr/0005-better-auth-separate-tables.md**

```markdown
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
```

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0001-monorepo-shape.md docs/adr/0002-tenancy-row-level.md docs/adr/0003-money-bigint-kobo.md docs/adr/0004-ids-uuid-v7-native-pg18.md docs/adr/0005-better-auth-separate-tables.md
git commit -m "docs(adr): 0001-0005 architecture decision records"
```

---

### Task 44: ADRs 0006–0010

**Files:**
- Create: `docs/adr/0006-payments-immutable-reversal-rows.md`
- Create: `docs/adr/0007-prisma-multischema-preview-flag.md`
- Create: `docs/adr/0008-soft-delete-partial-indexes.md`
- Create: `docs/adr/0009-version-pinning-manual.md`
- Create: `docs/adr/0010-deploy-app-of-apps-monorepo.md`

- [ ] **Step 1: Write docs/adr/0006-payments-immutable-reversal-rows.md**

```markdown
# ADR 0006 — Payments immutable; corrections via reversing rows

**Status:** Accepted (2026-05-12)

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
```

- [ ] **Step 2: Write docs/adr/0007-prisma-multischema-preview-flag.md**

```markdown
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
```

- [ ] **Step 3: Write docs/adr/0008-soft-delete-partial-indexes.md**

```markdown
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
```

- [ ] **Step 4: Write docs/adr/0009-version-pinning-manual.md**

```markdown
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
```

- [ ] **Step 5: Write docs/adr/0010-deploy-app-of-apps-monorepo.md**

```markdown
# ADR 0010 — Deploy app-of-apps in the same monorepo

**Status:** Accepted (2026-05-12)

## Context

GitOps purity argues for code in one repo and manifests in another. For a
single-product, single-team SaaS in Phase 0, that two-repo dance slows every
change. ArgoCD's app-of-apps pattern supports manifests living anywhere,
including the application repo.

## Decision

Manifests live in **`deploy/`** inside the application monorepo. A single
manually-applied `Application` (`deploy/argocd/root-app.yaml`) points at
`deploy/argocd/apps/`. Child Applications target Kustomize bases under
`deploy/k8s/`. ArgoCD Image Updater watches `repo.toyintest.org/solutio-web`
and commits resolved digests into `deploy/k8s/web/kustomization.yaml`.

## Consequences

- Code change + manifest change ship in one PR — atomic review.
- Trade-off: Image Updater needs write access to the repo. **GitHub deploy
  keys cannot be path-scoped** — the key has write access to the entire repo,
  not just `deploy/k8s/`. **Acceptable for Phase 0** (single committer, single
  product). **Migration path:** when team size or compliance demands
  path-scoped access, replace the deploy key with a GitHub App installed only
  on this repo, with `contents: write` permission and a fine-grained access
  policy restricting writes to `deploy/k8s/`.
- Sync waves order the deploy: CNPG (-10) → secrets (-5) → web (0).
```

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0006-payments-immutable-reversal-rows.md docs/adr/0007-prisma-multischema-preview-flag.md docs/adr/0008-soft-delete-partial-indexes.md docs/adr/0009-version-pinning-manual.md docs/adr/0010-deploy-app-of-apps-monorepo.md
git commit -m "docs(adr): 0006-0010 architecture decision records"
```

---

### Task 45: README — local dev, secret-sealing, version-update flows

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Replace README.md contents entirely**

```markdown
# Solutio Installments

B2B SaaS for tracking property installment payment plans for Nigerian real estate companies.

- **Spec:** `docs/superpowers/specs/2026-05-12-solutio-phase0-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-12-solutio-phase0.md`
- **ADRs:** `docs/adr/`

## Prerequisites

- Node 24 LTS (use `.nvmrc` — `nvm install $(cat .nvmrc)`)
- pnpm (version pinned in root `package.json` `packageManager` field — `corepack enable` handles it)
- Docker (for testcontainers integration tests and local E2E)
- `kubeseal` CLI (for re-sealing secrets)
- `crane` (for verifying image digests when bumping versions): `brew install crane`

## One-time setup

```bash
git clone <repo>
cd solutio
git config core.hooksPath .githooks
corepack enable
pnpm install --frozen-lockfile
```

## Local development

The app expects a Postgres database. Two options:

### Option A — disposable testcontainer

Tests handle this automatically. For interactive dev, use Option B.

### Option B — docker compose Postgres

```bash
docker run --rm -d \
  --name solutio-pg \
  -e POSTGRES_USER=solutio \
  -e POSTGRES_PASSWORD=solutio \
  -e POSTGRES_DB=solutio \
  -p 5432:5432 \
  postgres:18.3-bookworm@sha256:<POSTGRES_TC_DIGEST>
```

Create `apps/web/.env.local`:

```
DATABASE_URL=postgresql://solutio:solutio@localhost:5432/solutio?schema=public
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=http://localhost:3000
SEED_OWNER_EMAIL=owner@atrium.test
SEED_OWNER_PASSWORD=devpassword!12345
SEED_OWNER_NAME=Atrium Owner
```

Then:

```bash
pnpm --filter @solutio/db prisma migrate deploy
pnpm --filter @solutio/db seed
pnpm dev
```

Visit `http://localhost:3000/login`. The seed owner is forced to change their password on first login.

> **Note:** The `auth` schema is created by the `0000_init_schemas` migration, so `prisma migrate deploy` works on a fresh database with no manual `CREATE SCHEMA` step. If a non-Prisma workflow is used, run `psql -c "CREATE SCHEMA IF NOT EXISTS auth"` first.

## Testing

```bash
pnpm test                # unit + integration via testcontainers (Docker required)
pnpm test:integration    # integration only
pnpm test:coverage       # with coverage gate (80%)
pnpm --filter @solutio/web test:e2e   # Playwright (Docker required)
```

## Sealing a secret

```bash
# 1. Create plaintext in /tmp (NEVER under deploy/)
cat > /tmp/my.secret.yaml << 'YAML'
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: solutio-prod
type: Opaque
stringData:
  KEY: "value"
YAML

# 2. Seal
bash scripts/seal-secrets.sh /tmp/my.secret.yaml deploy/k8s/secrets/my.sealedsecret.yaml

# 3. Remove plaintext
rm /tmp/my.secret.yaml

# 4. Commit only the sealed file
git add deploy/k8s/secrets/my.sealedsecret.yaml
git commit -m "feat(deploy): seal my-secret"
```

The pre-commit hook rejects any unsealed `kind: Secret` under `deploy/`.

## Updating a version (the manual flow)

We pin everything exactly and **do not** use Renovate or Dependabot. To bump a dependency:

```bash
bash scripts/verify-versions.sh | tee /tmp/solutio-versions.txt
# Find the dep in /tmp/solutio-versions.txt — note exact version.
# Edit the relevant package.json (or Dockerfile, or CNPG CR) to that exact value.
pnpm install                 # regenerates lockfile
pnpm guard:all               # confirms all pinning guards pass
pnpm typecheck && pnpm test  # confirms nothing broke
git add . && git commit -m "chore(deps): bump <pkg> to <version>"
```

For Docker base images: `crane digest <image>` returns the new SHA — replace the digest in the relevant Dockerfile or CNPG CR.

## Deploying

ArgoCD root Application is applied once:

```bash
kubectl apply -n argocd -f deploy/argocd/root-app.yaml
```

After that, every push to `main` triggers GitHub Actions release, which builds and pushes `repo.toyintest.org/solutio-web:<sha>`. ArgoCD Image Updater watches the registry, writes the resolved digest into `deploy/k8s/web/kustomization.yaml`, and ArgoCD rolls the Deployment.

To inspect what's deployed right now:

```bash
git show main:deploy/k8s/web/kustomization.yaml | grep -A2 images:
```

## Project structure

See the file structure section of the implementation plan: `docs/superpowers/plans/2026-05-12-solutio-phase0.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README covering local dev, secrets, version bumps, deploy"
```

---

### Task 46: Final acceptance-criteria checklist

This task runs the spec's §11 acceptance criteria end-to-end. Each step is an assertion; if any fails, the task is not done.

- [ ] **AC1 — Push to main results in automated production deploy via ArgoCD Image Updater**

```bash
# Create a noop commit and push
git commit --allow-empty -m "chore: trigger ac1 verification"
git push origin main
# Watch GitHub Actions release run to completion
# Then watch ArgoCD Image Updater commit a digest into deploy/k8s/web/kustomization.yaml
# Then watch ArgoCD sync solutio-web to that digest
```

Expected: within ~5 minutes of push, `argocd app get solutio-web` shows `Synced` with the new image digest.

- [ ] **AC2 — OWNER user logs in, is forced to change password, lands on home**

```bash
# Hit the production URL in a browser; complete the flow with the seed credentials.
# (Or run the Playwright E2E against production: not in scope for Phase 0 CI.)
```

Expected: manual verification passes.

- [ ] **AC3 — `pnpm test` passes with ≥80% coverage; integration uses real Postgres container**

```bash
pnpm test:coverage
```

Expected: exit code 0, coverage thresholds met.

- [ ] **AC4 — `prisma migrate diff` passes on main**

```bash
pnpm --filter @solutio/db prisma:diff
```

Expected: exit code 0.

- [ ] **AC5 — All grep guards pass**

```bash
pnpm guard:all
```

Expected: four PASS lines.

- [ ] **AC6 — ArgoCD `solutio` Application healthy with three child Applications healthy**

```bash
argocd app list -l app.kubernetes.io/instance=solutio
```

Expected: `solutio`, `solutio-cnpg`, `solutio-secrets`, `solutio-web` all show `Healthy / Synced`.

- [ ] **AC7 — Exactly one tenant (Atrium) and one OWNER user in the database**

```bash
kubectl -n solutio-prod exec solutio-pg-1 -- psql -U solutio -d solutio -c \
  'SELECT slug FROM "Tenant"; SELECT email, role FROM "User";'
```

Expected: one row in each table, `slug='atrium-homes'`, one user with `role=OWNER`.

- [ ] **AC8 — All ten ADRs committed under docs/adr/**

```bash
ls docs/adr/ | wc -l
```

Expected: `10`.

- [ ] **AC9 — README documents local dev, secret-sealing, version-update, deploy**

```bash
grep -E '^## (Local development|Sealing a secret|Updating a version|Deploying)' README.md | wc -l
```

Expected: `4`.

- [ ] **Final commit on completion**

```bash
git commit --allow-empty -m "chore: Phase 0 complete — all 9 acceptance criteria pass"
git push origin main
```

---

## Plan complete

This plan implements every section of `docs/superpowers/specs/2026-05-12-solutio-phase0-design.md`. Tasks are ordered to keep the system buildable at every commit: scaffolding → schema → domain logic → auth → app shell → deploy → tests → docs → acceptance.

