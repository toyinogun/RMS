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
