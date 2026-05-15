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
  postgres:18.3-bookworm@sha256:80630f83606d8db77d30b3851b16a9f78be2d0d4dda6f7b82a1fdca5ebe3acba
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

After that, every push to `main` triggers GitHub Actions release, which builds and pushes `ghcr.io/toyinogun/rms:<sha>`. ArgoCD Image Updater watches the registry, writes the resolved digest into `deploy/k8s/web/kustomization.yaml`, and ArgoCD rolls the Deployment.

To inspect what's deployed right now:

```bash
git show main:deploy/k8s/web/kustomization.yaml | grep -A2 images:
```

## Project structure

See the file structure section of the implementation plan: `docs/superpowers/plans/2026-05-12-solutio-phase0.md`.
