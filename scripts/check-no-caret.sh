#!/usr/bin/env bash
# Fails if any git-tracked package.json uses caret or tilde version specifiers.
set -euo pipefail

files=$(git ls-files -- 'package.json' '**/package.json' 2>/dev/null || true)

if [[ -z "$files" ]]; then
  echo "PASS: no caret or tilde in any package.json"
  exit 0
fi

violations=$(
  echo "$files" \
    | xargs grep -EnH '"\s*[\^~]' 2>/dev/null \
    | grep -v '"version":' || true
)

if [[ -n "$violations" ]]; then
  echo "ERROR: caret/tilde version specifiers found:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "PASS: no caret or tilde in any package.json"
