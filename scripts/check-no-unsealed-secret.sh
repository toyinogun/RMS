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
