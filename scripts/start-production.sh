#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

: "${SESSION_SECRET:?SESSION_SECRET must be set in .env.production}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME must be set in .env.production}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set in .env.production}"

exec vinext start
