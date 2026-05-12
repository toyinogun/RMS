# Solutio Installments — Phase 0 Design

**Date:** 2026-05-12
**Status:** Approved for implementation planning
**Author:** Toyin Ogunseinde
**First customer:** Atrium Homes

---

## 1. Context

**Solutio Installments** is a B2B SaaS that tracks property installment payment plans (6–36 month plans, deposit + monthly payments) for Nigerian real estate companies. Today this workflow lives in Excel + WhatsApp chaos. Phase 0 replaces that for a single customer (Atrium Homes) with a schema and architecture that is ready to multi-tenant without restructuring.

Phase 0 covers only **monorepo foundation, data model, and deploy pipeline**. No payment provider integration, no messaging integration, no public API.

---

## 2. Scope

### In Phase 0
- Monorepo scaffolding (Next.js 16.2.x monolith, pnpm + Turborepo, packages/db, packages/shared)
- Prisma schema with row-level multi-tenancy on every business table
- Manual payment ledger (Excel-era migration possible on day 1)
- Better Auth (email + password, sessions only) with force-password-change on first login
- ArgoCD app-of-apps deployment to existing k3s cluster
- CloudNativePG cluster, single instance, Postgres 18.3
- Sealed Secrets for in-cluster secret management
- GitHub Actions CI building and pushing images to `repo.toyintest.org`
- ArgoCD Image Updater watching digests and writing back to manifests
- Exact version pinning at every layer (no `^`, no `~`, SHA-pinned Docker bases)
- Vitest unit + integration tests with testcontainers; one Playwright happy-path E2E
- Minimum 80% coverage gate in CI

### Explicitly out of Phase 0 (deferred)
| Item | Lands in |
|---|---|
| Paystack integration | Phase 2 |
| Mono integration | Phase 2 |
| WhatsApp Business bot | Phase 3 |
| SMTP / email sending | Phase 1 |
| SMS notifications | Phase 3 |
| Multi-tenant invite flow + RLS-on | Phase 1 |
| Worker app (`apps/worker/`) | Phase 2 |
| Reporting / dashboards | Phase 2 |
| File uploads (signed contracts as PDFs) | Phase 1 |
| Audit log table | Phase 1 |
| Staging environment | When justified by team size or risk |

The directory layout for `apps/`, `deploy/k8s/`, and `deploy/argocd/apps/` is shaped so each of the above is **additive** — adding `apps/worker/` and `deploy/k8s/worker/` requires no edits to existing files.

---

## 3. Architectural Anchors (quick reference)

| Concern | Choice |
|---|---|
| Stack | Next.js 16.2.x monolith (route handlers + server actions), Node 24 LTS |
| Repo | Turborepo, pnpm, `apps/web` + `packages/{db,shared,config}` |
| Tenancy | Row-level: `tenant_id NOT NULL` on every business table; RLS-ready, RLS-off in Phase 0 |
| Money | `BigInt` kobo (NGN minor units) — no Decimal, no floats |
| IDs | UUID v7 via PostgreSQL 18.3 native `uuidv7()` |
| Auth | Better Auth, email + password, sessions; separate `auth.*` schema |
| Auth join | Domain `User.authUserId` → Better Auth `user.id` (never email) |
| Soft delete | `deleted_at` on customers / properties / plans only; partial indexes |
| Payments | Immutable rows; corrections via reversing Payment with `reversedById` |
| Deploy | k3s + ArgoCD + CNPG (existing); app-of-apps in monorepo; prod namespace only |
| Secrets | Bitnami Sealed Secrets |
| CI | GitHub Actions → `repo.toyintest.org` |
| Image sync | ArgoCD Image Updater (digest strategy) writes back to `kustomization.yaml` |
| Versions | Exact pins everywhere; SHA digests on Docker bases; no Renovate / Dependabot |

---

## 4. Monorepo Architecture

```
solutio/
├── apps/
│   └── web/                        Next.js 16.2.x App Router
│       └── Dockerfile
├── packages/
│   ├── db/                         Prisma schema, client, migrations, seed
│   ├── shared/                     Domain-organized shared code
│   │   └── src/
│   │       ├── installments/       status enum, schedule generation, validation
│   │       ├── payments/           payment types, allocation logic
│   │       ├── money/              kobo helpers, formatting, currency
│   │       ├── tenant/             TenantContext type, forTenant() guards
│   │       └── index.ts            barrel exports
│   └── config/                     shared tsconfig, eslint, prettier
├── deploy/
│   ├── argocd/
│   │   ├── root-app.yaml           single ArgoCD Application installed manually
│   │   └── apps/                   one Application per workload
│   │       ├── cnpg-cluster.yaml
│   │       ├── solutio-secrets.yaml
│   │       └── solutio-web.yaml
│   └── k8s/                        Kustomize bases per service
│       ├── cnpg/                   Cluster CR, backup, monitoring
│       ├── web/                    Deployment, Service, Ingress, HPA
│       └── secrets/                SealedSecret manifests
├── docs/
│   ├── adr/                        Architecture Decision Records (numbered)
│   └── superpowers/specs/          design docs (this file)
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── .nvmrc                          Node 24 LTS, exact patch
├── .npmrc                          save-exact=true, save-prefix=""
├── pnpm-workspace.yaml
├── pnpm-lock.yaml                  committed
├── package.json                    exact versions, no ^ or ~
└── turbo.json
```

**Tooling versions** — verified at scaffold time before pinning:

| Tool | Verification command | Pinning location |
|---|---|---|
| Node | `curl https://nodejs.org/dist/index.json \| jq '[.[] \| select(.lts != false)] \| .[0]'` | `.nvmrc`, Dockerfile base SHA, `engines` in package.json |
| pnpm | `npm view pnpm version` | root `packageManager` field (corepack reads it) |
| Next.js | `npm view next version` | `apps/web/package.json` |
| Prisma | `npm view prisma version` | `packages/db/package.json` |
| Better Auth | `npm view better-auth version` | `apps/web/package.json` |
| Vitest | `npm view vitest version` | root devDependencies |
| Playwright | `npm view @playwright/test version` | root devDependencies |
| Distroless Node | `crane digest gcr.io/distroless/nodejs24-debian12:latest` | Dockerfile FROM line |
| Node base | `crane digest docker.io/library/node:24.x-bookworm-slim` | Dockerfile FROM line |
| CNPG PG image | check `github.com/cloudnative-pg/postgres-containers/releases` for latest 18.x tag; then `crane digest ghcr.io/cloudnative-pg/postgresql:18.3-bookworm` | CNPG Cluster CR `imageName` |
| kubeseal | `kubeseal --version` matched against latest in `bitnami-labs/sealed-secrets` releases | `.tool-versions`, README |

---

## 5. Data Model

### 5.1 Conventions
- IDs: `String @id @default(dbgenerated("uuidv7()")) @db.Uuid` — native PG 18.3 function.
- Tenant scoping: `tenantId String @db.Uuid` (NOT NULL, FK to `tenants.id`) on every business table.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `createdBy String? @db.Uuid` (nullable for system actions).
- Soft delete: `deletedAt DateTime?` on **customers, properties, plans only**. Payments and installments are immutable; corrections are new rows.
- Money: `BigInt` kobo (NGN minor units). No floats. No Decimal.
- App-side `uuidv7` npm package is fallback only (tests, scripts) — runtime IDs are generated by Postgres.

### 5.2 Prisma schema sketch

```prisma
model Tenant {
  id          String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  slug        String   @unique
  name        String
  currency    String   @default("NGN")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  users       User[]
  customers   Customer[]
  properties  Property[]
  plans       Plan[]
  @@schema("public")
}

model User {
  id            String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String   @db.Uuid
  authUserId    String   @db.Uuid                        // Better Auth user.id — stable join key
  email         String                                    // display only; refreshed from Better Auth
  name          String
  role          UserRole
  mustChangePassword Boolean @default(false)              // seed sets true on first OWNER
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, authUserId])                        // tenant-scoped join key
  @@unique([authUserId])                                  // one tenant per auth user in Phase 0; drop in Phase 1
  @@index([tenantId])
  @@schema("public")
}

enum UserRole { OWNER  ADMIN  STAFF }

model Customer {
  id          String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId    String    @db.Uuid
  fullName    String
  email       String?
  phone       String                                       // E.164, validated by Zod
  nationalId  String?
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  createdBy   String?   @db.Uuid
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  plans       Plan[]
  @@index([tenantId])
  @@index([tenantId, phone])                               // accounts staff lookup hot path
  // partial index `customer_active_idx` added via raw SQL in migration
  @@schema("public")
}

model Property {
  id              String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String    @db.Uuid
  code            String
  title           String
  addressLine     String
  city            String
  totalPriceKobo  BigInt
  status          PropertyStatus
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?
  createdBy       String?   @db.Uuid
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  plans           Plan[]
  @@unique([tenantId, code])
  @@index([tenantId, status])
  // partial index `property_active_idx` (tenant_id, status) added via raw SQL in migration
  @@schema("public")
}

enum PropertyStatus { AVAILABLE  RESERVED  SOLD }

model Plan {
  id              String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String    @db.Uuid
  customerId      String    @db.Uuid
  propertyId      String    @db.Uuid
  totalPriceKobo  BigInt
  depositKobo     BigInt
  monthlyKobo     BigInt
  termMonths      Int                                       // 6..36 enforced in Zod
  startDate       DateTime  @db.Date
  status          PlanStatus
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?
  createdBy       String?   @db.Uuid
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  customer        Customer  @relation(fields: [customerId], references: [id])
  property        Property  @relation(fields: [propertyId], references: [id])
  installments    Installment[]
  payments        Payment[]
  @@index([tenantId, status])
  @@index([tenantId, customerId])
  @@index([tenantId, propertyId, status])                    // property-detail page + double-allocation guard
  // partial index `plan_active_idx` (tenant_id, status) added via raw SQL in migration
  @@schema("public")
}

enum PlanStatus { DRAFT  ACTIVE  COMPLETED  DEFAULTED  CANCELLED }

model Installment {
  id              String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String   @db.Uuid
  planId          String   @db.Uuid
  sequenceNo      Int                                       // 0 = deposit, 1..N = monthly
  dueDate         DateTime @db.Date
  amountDueKobo   BigInt
  amountPaidKobo  BigInt   @default(0)                      // denormalized running total
  status          InstallmentStatus
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  plan            Plan     @relation(fields: [planId], references: [id])
  allocations     PaymentAllocation[]
  @@unique([planId, sequenceNo])
  @@index([tenantId, status, dueDate])
  @@schema("public")
}

enum InstallmentStatus { PENDING  PARTIAL  PAID  OVERDUE  WAIVED }

model Payment {
  id            String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String   @db.Uuid
  planId        String   @db.Uuid
  amountKobo    BigInt                                      // negative on reversal rows
  paidAt        DateTime
  method        PaymentMethod
  reference     String?                                     // cheque/draft number, bank ref, receipt no
  notes         String?
  recordedBy    String   @db.Uuid
  reversedById  String?  @db.Uuid
  createdAt     DateTime @default(now())
  plan          Plan     @relation(fields: [planId], references: [id])
  allocations   PaymentAllocation[]
  reversedBy    Payment? @relation("PaymentReversal", fields: [reversedById], references: [id])
  reverses      Payment[] @relation("PaymentReversal")
  @@index([tenantId, planId, paidAt])
  @@schema("public")
}

enum PaymentMethod { CASH  TRANSFER  CHEQUE  CARD_MANUAL  OTHER }

model PaymentAllocation {
  id              String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String   @db.Uuid
  paymentId       String   @db.Uuid
  installmentId   String   @db.Uuid
  amountKobo      BigInt                                    // can be negative on reversal allocations
  createdAt       DateTime @default(now())
  payment         Payment     @relation(fields: [paymentId], references: [id])
  installment     Installment @relation(fields: [installmentId], references: [id])
  @@index([tenantId, paymentId])
  @@index([tenantId, installmentId])
  @@schema("public")
}
```

Better Auth tables (`auth_user`, `account`, `session`, `verification`) live in the `auth` schema under Prisma's `multiSchema` Preview feature. The Preview flag concerns API-stability guarantees, not functional readiness — multiSchema has been stable in production for over a year.

### 5.3 Partial indexes (raw SQL in initial migration)

```sql
-- Hot-path indexes for active rows
CREATE INDEX customer_active_idx ON "Customer"(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX property_active_idx ON "Property"(tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX plan_active_idx ON "Plan"(tenant_id, status)
  WHERE deleted_at IS NULL;

-- DB-enforced invariant: at most one ACTIVE or COMPLETED Plan per Property per tenant.
-- Service layer also checks this inside a SERIALIZABLE transaction; the unique
-- partial index is the belt-and-suspenders guarantee.
CREATE UNIQUE INDEX plan_one_active_per_property
  ON "Plan"(tenant_id, property_id)
  WHERE status IN ('ACTIVE', 'COMPLETED') AND deleted_at IS NULL;
```

Smaller indexes, faster scans on the hot path. Composite `(tenant_id, deleted_at)` indexes are not used.

### 5.4 Domain invariants enforced in service layer (not DB)

- Installment generation: `sequenceNo=0` is deposit, `1..termMonths` are monthly. `amountDueKobo` sum must equal `totalPriceKobo`. Final monthly absorbs any rounding remainder.
- A Plan may not transition `DRAFT → ACTIVE` if its Property already has another `ACTIVE`/`COMPLETED` Plan (enforced via index + service-layer check inside a `SERIALIZABLE` transaction).
- Payment amounts: regular Payments have `amountKobo > 0`; reversal rows have `amountKobo < 0` AND `reversedById IS NOT NULL`.
- `PaymentAllocation` sum within a Payment must equal `Payment.amountKobo`.
- Installment status is derived in the service layer from `amountPaidKobo` vs `amountDueKobo` and `dueDate` vs today. Update in same transaction as the allocation write.

---

## 6. Auth & Tenant Context

### 6.1 Better Auth setup
- `apps/web/lib/auth.ts` configures Better Auth with the Prisma adapter, pointed at the `auth` schema.
- Email + password only. No magic link, no OAuth, no 2FA in Phase 0.
- Password reset endpoint exists but logs the reset token; SMTP wiring lands in Phase 1.
- Session cookie: HTTP-only, Secure, SameSite=Lax, `__Host-` prefix, 7-day rolling expiry.

### 6.2 Auth schema bootstrap

The `auth` schema must exist before the first Prisma migration runs.

**In deployed clusters (CNPG):** declared in the Cluster CR.

```yaml
bootstrap:
  initdb:
    database: solutio
    owner: solutio
    postInitSQL:
      - CREATE SCHEMA IF NOT EXISTS auth;
      - GRANT ALL ON SCHEMA auth TO solutio;
```

**In local dev:** committed as the first Prisma migration so `prisma migrate dev` succeeds on a fresh database without any manual psql step. The migration file lives at:

```
packages/db/prisma/migrations/0000_init_schemas/migration.sql
```

containing:

```sql
CREATE SCHEMA IF NOT EXISTS auth;
```

Idempotent in both environments. The CNPG `postInitSQL` runs once at cluster bootstrap; the Prisma migration is a no-op against the deployed database (schema already exists) but creates the schema on every fresh local dev database. Both paths are intentional belt-and-suspenders — neither alone covers both targets reliably. README also documents the `psql -c "CREATE SCHEMA IF NOT EXISTS auth"` manual fallback for any non-Prisma local DB workflow.

### 6.3 Domain User ↔ Better Auth user join
Domain `User.authUserId` references Better Auth's `user.id`. **Never join on email** — email is mutable display state. If email changes in Better Auth, the domain row's `email` field is refreshed via a Better Auth post-update hook, but the join itself is unaffected.

### 6.4 TenantContext

```ts
// packages/shared/tenant/context.ts
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

### 6.5 Resolution & propagation

- `getTenantContext()` in `apps/web/lib/auth.ts` is wrapped in React `cache()` — per-request memoization. Reads session, resolves domain User by `authUserId`, returns `TenantContext` or `null`.
- **Called only at resolver boundaries**: RSCs, route handlers, server actions, and (Phase 2) worker job entry points.
- **Never called inside `packages/shared/`**. Service functions take `ctx: TenantContext` as their explicit first parameter:

```ts
// packages/shared/installments/service.ts
export async function listActivePlans(ctx: TenantContext) {
  const db = forTenant(ctx.tenantId);
  return db.plan.findMany({ where: { status: 'ACTIVE' } });
}
```

Enforced by an ESLint rule (`no-restricted-imports` in `packages/config/eslint`) blocking imports of `getTenantContext` from any file under `packages/shared/**`.

### 6.6 Tenant-scoped Prisma client

`packages/db/src/tenantClient.ts` exports `forTenant(tenantId)`. It returns a Prisma client built via Prisma client extensions:
- Read queries on business models auto-inject `where: { tenantId }`.
- Write queries auto-inject `data: { tenantId }`.
- Any query that explicitly passes a different `tenantId` is rejected at runtime with a `CrossTenantWriteError`.

The raw Prisma client is exported only for: migrations, seed scripts, the Better Auth adapter, and `tenantClient.ts` itself. An ESLint rule restricts raw-client imports to those paths.

### 6.7 RBAC
Three roles — `OWNER`, `ADMIN`, `STAFF`. Phase 0 differentiates only OWNER (can manage users / settings) from non-OWNER. The `requireRole(ctx, ['OWNER'])` helper exists; granular ADMIN vs STAFF gating lands in Phase 1.

### 6.8 Force-password-change on first login
- `User.mustChangePassword Boolean @default(false)`.
- Seed script sets `mustChangePassword=true` on the OWNER it creates.
- Enforced in the root authenticated layout RSC at `app/(authenticated)/layout.tsx`. **Not in middleware** — Edge runtime is fragile around DB-backed session lookups.
- `/onboarding/change-password` lives in a sibling route group `app/(onboarding)/` with its own minimal authenticated layout that does NOT redirect on the flag (prevents infinite loop).
- The change-password server action updates Better Auth's password AND clears `mustChangePassword` in the same DB transaction. Partial success is not possible.
- This flag and route are reused in Phase 1 for invite-acceptance and admin-initiated password reset flows — no new mechanism needed.

### 6.9 Seed flow
`packages/db/src/seed.ts` is idempotent and safe to re-run:
1. Upsert `Tenant { slug: "atrium-homes", name: "Atrium Homes" }`.
2. Call Better Auth's signup with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (from environment, sourced from a SealedSecret in cluster, from `.env.local` in dev).
3. Upsert domain `User` with `authUserId` set, `role: OWNER`, `mustChangePassword: true`.

After deploy, first login = seed credentials → forced password change.

---

## 7. Deploy Pipeline

### 7.1 CNPG cluster

```yaml
# deploy/k8s/cnpg/cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: solutio-pg
  namespace: solutio-prod
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:18.3-bookworm@sha256:<digest verified at scaffold>
  bootstrap:
    initdb:
      database: solutio
      owner: solutio
      postInitSQL:
        - CREATE SCHEMA IF NOT EXISTS auth;
        - GRANT ALL ON SCHEMA auth TO solutio;
  storage:
    size: 20Gi
    storageClass: <existing storageclass>
  backup:
    retentionPolicy: 30d
  monitoring:
    enablePodMonitor: true
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }
```

Single instance is deliberate — promotion to HA is `instances: 3` + reconcile, no recreation.

### 7.2 `apps/web` container image

Multi-stage Dockerfile, distroless runtime, non-root, three pinned digests:

```dockerfile
FROM node:24.<patch>-bookworm-slim@sha256:<digest> AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@<pinned>--activate
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @solutio/db prisma generate
RUN pnpm --filter @solutio/web build

FROM gcr.io/distroless/nodejs24-debian12@sha256:<digest> AS runtime
WORKDIR /app
USER nonroot
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["apps/web/server.js"]
```

Next.js `standalone` output keeps the image small. Distroless runtime has no shell or package manager.

### 7.3 Kubernetes manifests for `apps/web`
Kustomize base `deploy/k8s/web/`:
- `Deployment` — 2 replicas, `runAsNonRoot: true`, read-only root filesystem, resource requests/limits, readiness + liveness probes on `/api/health`.
- `Service` — ClusterIP on 3000.
- `Ingress` — TLS via existing cert-manager `ClusterIssuer`, host pinned via Kustomize patch (e.g. `solutio.toyintest.org`).
- `HorizontalPodAutoscaler` — min 2, max 5, CPU target 70%.

### 7.4 ArgoCD app-of-apps

```yaml
# deploy/argocd/root-app.yaml — installed manually once
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: solutio, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/<owner>/solutio
    path: deploy/argocd/apps
    targetRevision: main
    directory: { recurse: true }
  destination: { server: https://kubernetes.default.svc, namespace: argocd }
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

`deploy/argocd/apps/`:
- `cnpg-cluster.yaml` → `path: deploy/k8s/cnpg`, sync wave `-10`
- `solutio-secrets.yaml` → `path: deploy/k8s/secrets`, sync wave `-5`
- `solutio-web.yaml` → `path: deploy/k8s/web`, sync wave `0`

Phase 2 adds `solutio-worker.yaml` as a sibling — no edits to existing files.

### 7.5 Image digest flow

1. Push to `main` → GitHub Actions `release.yml` builds `solutio-web`, pushes to `repo.toyintest.org/solutio-web@sha256:<digest>` plus moving tag `:main`.
2. **ArgoCD Image Updater** (cluster-side) watches `repo.toyintest.org/solutio-web` with `update-strategy: digest` and commits the new `@sha256:<digest>` into `deploy/k8s/web/kustomization.yaml`'s `images:` section.
3. ArgoCD detects the manifest change, syncs the Deployment, k8s rolls.
4. The committed digest in git is the authoritative production reference at any moment.

Image Updater authenticates via a dedicated GitHub Deploy Key with write access to this repo. **Known limitation:** GitHub deploy keys cannot be path-scoped — the Image Updater key has write access to the entire repo, not just `deploy/k8s/`. This is acceptable for Phase 0 (single committer, single product) and documented in ADR-0010. Migration path when team size or compliance requires path-scoped access: replace the deploy key with a GitHub App installed only on this repo, with `contents: write` permission and a fine-grained access policy. The release workflow itself does NOT touch `deploy/k8s/`.

### 7.6 Sealed Secrets

```
deploy/k8s/secrets/
├── solutio-db.sealedsecret.yaml          → DATABASE_URL
├── solutio-auth.sealedsecret.yaml        → BETTER_AUTH_SECRET, BETTER_AUTH_URL
└── solutio-seed.sealedsecret.yaml        → SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD
```

Encryption: `kubeseal --controller-namespace kube-system --format yaml < secret.yaml > sealedsecret.yaml`. kubeseal version pinned in `.tool-versions` and `README.md`.

Guardrails:
- Pre-commit hook rejects any committed `kind: Secret` (unsealed) under `deploy/`.
- CI grep guard rejects the same.

### 7.7 CI workflows

`.github/workflows/ci.yml` (every PR + push):
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (Vitest unit + integration; integration uses testcontainers-postgres pinned by SHA)
- `pnpm --filter @solutio/db prisma migrate diff --exit-code` (fails on schema drift)
- `pnpm --filter @solutio/db prisma validate`
- Grep guard: fail if any `package.json` has `"^"` or `"~"` in deps/devDeps
- Grep guard: fail if any `Dockerfile` `FROM` lacks `@sha256:`
- Grep guard: fail if any `uses:` in workflows lacks `@<sha>`
- Coverage gate: 80% minimum (Vitest's `--coverage.thresholds`)

`.github/workflows/release.yml` (push to main):
- All CI steps, plus
- `docker buildx build --push --platform linux/amd64` for `apps/web`
- Tag with `${{ github.sha }}` and push to `repo.toyintest.org/solutio-web`
- Does NOT modify `deploy/k8s/` — ArgoCD Image Updater handles that

All workflow `uses:` references pin to a commit SHA (not a tag), updated manually when reviewing action releases.

---

## 8. Version Pinning Policy

| Layer | Rule | Verification |
|---|---|---|
| `package.json` | Exact versions, no `^` or `~` | `.npmrc` sets `save-exact=true`, CI grep guard |
| `pnpm-lock.yaml` | Committed | `--frozen-lockfile` in CI and Docker |
| Node | `.nvmrc` exact patch | Dockerfile base SHA matches; `engines` in package.json |
| Dockerfile bases | `FROM image:tag@sha256:<digest>` | CI grep guard rejects FROM without digest |
| PG image (CNPG) | `imageName: ...:18.3-bookworm@sha256:<digest>` | Manual at scaffold; documented in ADR |
| pnpm | `packageManager: "pnpm@<x.y.z>"` | corepack reads it |
| GitHub Actions | `uses: owner/repo@<commit-sha>` | CI grep guard |

**Update flow (manual, deliberate):**
1. Human decides to bump a dependency (security advisory, release notes review, monthly sweep).
2. Run the verification command for that dep.
3. Edit the exact version in `package.json` / Dockerfile / CNPG CR.
4. `pnpm install` regenerates lockfile; commit lockfile + manifest together.
5. CI runs full suite; merge.

**No automated dependency tooling.** No `renovate.json`. No `.github/dependabot.yml`. Updates are deliberate and human-driven.

---

## 9. Testing Strategy

### 9.1 Framework
- **Vitest** for unit + integration. One config, two named projects: `unit`, `integration`.
- **Testcontainers-postgres** for integration tests — pinned to a specific Postgres 18.3 image SHA digest, same as the CNPG cluster image where possible.
- **Playwright** for one E2E happy-path test in Phase 0.

### 9.2 Coverage
- 80% minimum, enforced in CI via `--coverage.thresholds`.
- Coverage report uploaded as a CI artifact.

### 9.3 Scope for Phase 0

Unit tests live in `packages/shared/*/`:
- `money/` — kobo math, formatting, zero, large values, negatives.
- `installments/` — schedule generation: term + deposit + monthly → N rows, correct due dates, sum equals total price, rounding remainder absorbed in final installment.
- `payments/` — allocation logic: one Payment paying multiple Installments, overpayment, reversal allocations summing to zero.
- `tenant/` — `forTenant()` client correctness: auto-scoping, cross-tenant write rejection, raw-client lint rule coverage.

Integration tests live in `packages/db/__tests__/` and `apps/web/__tests__/`:
- Prisma client wired to a real Postgres container.
- Schema invariants (unique constraints, partial indexes presence verified via `pg_indexes`).
- Seed script idempotency (run twice, assert state is identical).
- Better Auth signup → domain User row exists with correct `authUserId`.
- **Denormalization drift test for `Installment.amountPaidKobo`:** record multiple Payments with allocations through the service layer (including overpayments, partial allocations, reversal rows); for every touched installment, assert `Installment.amountPaidKobo == SUM(PaymentAllocation.amountKobo)` queried independently. Catches any code path that writes allocations without updating the denormalized total in the same transaction. A periodic reconciliation job that emits the same check as a metric (alerting on drift in production) lands in Phase 1.

One E2E happy path in `apps/web/e2e/`:
- Login as seed owner → forced password change → create Customer → create Property → create Plan (deposit + 12 monthlies) → record Payment → see Installment status update.

### 9.4 Conventions
- No mocking of the database in integration tests — testcontainers only.
- Tests must test real behavior, not assert against mocks of the system under test.
- No `it.skip`, `test.todo`, or `expect(true)` placeholders.
- Every business rule in the service layer has at least one positive and one negative test.

---

## 10. ADRs

Numbered Markdown files under `docs/adr/`:

| # | Title |
|---|---|
| 0001 | Monorepo shape: Turborepo + Next.js monolith |
| 0002 | Row-level multi-tenancy |
| 0003 | Money as BigInt kobo |
| 0004 | UUID v7 via native PG 18.3 function |
| 0005 | Better Auth + separate `auth` schema + `authUserId` join |
| 0006 | Payments immutable; reversal rows for corrections |
| 0007 | Prisma multiSchema Preview flag — production-stable |
| 0008 | Soft delete via partial indexes |
| 0009 | Manual version pinning — no Renovate / Dependabot |
| 0010 | Deploy app-of-apps in the same monorepo (incl. deploy-key blast-radius note) |

Each ADR is short (status, context, decision, consequences) and immutable once accepted — future changes get a new ADR superseding the old one.

---

## 11. Acceptance Criteria for "Phase 0 done"

1. Pushing to `main` results in an automated production deploy via ArgoCD Image Updater.
2. An OWNER user can log in to `solutio.toyintest.org` (or pinned domain), is forced to change their password on first login, and lands on a working authenticated home page.
3. `pnpm test` passes in CI with ≥80% coverage; integration tests run against a real Postgres container.
4. `pnpm --filter @solutio/db prisma migrate diff --exit-code` passes on `main`.
5. All grep guards pass (no `^`/`~`, no unpinned `FROM`, no unpinned `uses:`, no unsealed `kind: Secret`).
6. ArgoCD shows `solutio` Application as `Healthy / Synced` with three child Applications also `Healthy / Synced`.
7. The Atrium tenant exists in the database with one OWNER user; no other tenant data.
8. All ten ADRs are committed under `docs/adr/`.
9. README documents: local dev setup, secret-sealing flow, version-update flow, and the `auth` schema bootstrap dependency.

---

## 12. References

Memory entries informing this spec:
- Shared packages organized by domain
- Better Auth joins on `user.id` not email
- Partial indexes for soft-deleted tables
- Service-layer functions take ctx as explicit first parameter
- Next.js auth gates in RSC layout, not middleware
- No Renovate / Dependabot — manual dep updates
- Solutio Phase 0 anchors (project memory)
