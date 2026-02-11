#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failures=0

while IFS= read -r file; do
  file_dir="$(dirname "$file")"

  while IFS= read -r link_target; do
    target="${link_target%%#*}"
    target="${target#<}"
    target="${target%>}"
    target="${target%% *}"

    [[ -z "$target" ]] && continue

    case "$target" in
      http://*|https://*|mailto:*|tel:*|javascript:*|data:*)
        continue
        ;;
    esac

    if [[ "$target" == /* ]]; then
      resolved="$target"
    else
      resolved="$file_dir/$target"
    fi

    if [[ ! -e "$resolved" ]]; then
      echo "Missing link target: $file -> $target"
      failures=$((failures + 1))
    fi
  done < <(grep -oE '\[[^][]+\]\([^)]+\)' "$file" | sed -E 's/^.*\(([^()]*)\)$/\1/' || true)
done < <(find . -type f -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' | sort)

if [[ "$failures" -ne 0 ]]; then
  printf '\nLocal markdown link check failed with %s missing target(s).\n' "$failures"
  exit 1
fi

echo "Local markdown link check passed."
