#!/usr/bin/env bash
# @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
set -euo pipefail
contest="${1:?Pass the internal KHL contest ID}"
[[ "$contest" =~ ^[a-zA-Z0-9_-]{1,100}$ ]] || exit 64
mkdir -p /home/deploy/.cache
exec 9>/home/deploy/.cache/fantasy-khl-daily.lock
flock -n 9 || { echo 'KHL daily sync is already running'; exit 0; }
docker exec -e KHL_SYNC_ENABLED=true -e NODE_OPTIONS=--max-old-space-size=384 fantasy-scout-worker timeout 7000 node scripts/khl-runner.cjs daily "$contest"
