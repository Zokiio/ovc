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

has_key() {
  local key="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -Fq -- "$key" "$file"
  else
    grep -Fq -- "$key" "$file"
  fi
}

while IFS= read -r key; do
  [[ -z "$key" ]] && continue

  if ! has_key "$key" "$doc_file"; then
    echo "Missing config key in docs/operations/configuration.md: $key"
    missing=$((missing + 1))
  fi
done < <(awk -F= '/^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/{gsub(/[[:space:]]/, "", $1); print $1}' "$config_file" | sort -u)

if [[ "$missing" -ne 0 ]]; then
  printf '\nConfiguration key coverage check failed with %s missing key(s).\n' "$missing"
  exit 1
fi

echo "Configuration key coverage check passed."
