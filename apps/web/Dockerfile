# syntax=docker/dockerfile:1.7

# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:24.15.0-bookworm-slim@sha256:24dc26ef1e3c3690f27ebc4136c9c186c3133b25563ae4d7f0692e4d1fe5db0e AS deps
WORKDIR /app
ENV CI=1 PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

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
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    pnpm --filter @solutio/db prisma:generate
RUN pnpm --filter @solutio/web build

# ── Stage 3: distroless runtime ───────────────────────────────────────────────
FROM gcr.io/distroless/nodejs24-debian12@sha256:61f4f4341db81820c24ce771b83d202eb6452076f58628cd536cc7d94a10978b AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
USER nonroot

COPY --from=build --chown=nonroot:nonroot /app/apps/web/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nonroot:nonroot /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["apps/web/server.js"]
