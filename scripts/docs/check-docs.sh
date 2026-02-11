#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bash "$repo_root/scripts/docs/check-local-links.sh"
bash "$repo_root/scripts/docs/check-config-key-coverage.sh"

echo "All documentation checks passed."
