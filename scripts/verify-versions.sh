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
