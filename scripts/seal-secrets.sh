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
