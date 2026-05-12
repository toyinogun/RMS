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
