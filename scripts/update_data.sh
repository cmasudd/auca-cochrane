#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/var/www/api_sensores/venv/bin/python}"
BRANCH="${BRANCH:-main}"

cd "$REPO_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: el clon del publicador tiene cambios sin commit" >&2
  exit 1
fi

git pull --ff-only origin "$BRANCH"
"$PYTHON_BIN" scripts/export_monthly_csv.py
"$PYTHON_BIN" scripts/validate_export.py

if [[ -n "$(git status --porcelain -- data)" ]]; then
  git add -- data
  git commit -m "datos: actualización horaria"
fi

# Reintenta también un commit que haya quedado local tras una falla de red.
git push origin "$BRANCH"
