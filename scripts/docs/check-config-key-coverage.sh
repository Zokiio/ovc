#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config_file="$repo_root/hytale-plugin/src/main/resources/ovc.conf.example"
doc_file="$repo_root/docs/operations/configuration.md"

if [[ ! -f "$config_file" ]]; then
  echo "Config template not found: $config_file"
  exit 1
fi

if [[ ! -f "$doc_file" ]]; then
  echo "Canonical configuration doc not found: $doc_file"
  exit 1
fi

missing=0

while IFS= read -r key; do
  [[ -z "$key" ]] && continue

  if ! rg -Fq -- "$key" "$doc_file"; then
    echo "Missing config key in docs/operations/configuration.md: $key"
    missing=$((missing + 1))
  fi
done < <(awk -F= '/^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/{gsub(/[[:space:]]/, "", $1); print $1}' "$config_file" | sort -u)

if [[ "$missing" -ne 0 ]]; then
  printf '\nConfiguration key coverage check failed with %s missing key(s).\n' "$missing"
  exit 1
fi

echo "Configuration key coverage check passed."
