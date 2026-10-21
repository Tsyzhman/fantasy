#!/usr/bin/env bash
# @spec spec://modules/franchises/FEAT-005-franchise-analytics#data
set -euo pipefail
mkdir -p /home/deploy/.cache
exec 9>/home/deploy/.cache/fantasy-franchises.lock
flock -n 9 || exit 0
docker exec -e NODE_OPTIONS=--max-old-space-size=768 -e FRANCHISE_RESUME_AFTER fantasy-scout-worker sh -c 'exec timeout --signal=TERM --kill-after=15 5500 flock --exclusive --no-fork "${FANTASY_HEAVY_JOB_LOCK_PATH:-/app/storage/franchises/.heavy-job.lock}" node scripts/franchises.cjs --sync'
