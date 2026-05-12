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
