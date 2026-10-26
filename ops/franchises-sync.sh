#!/usr/bin/env bash
# @spec spec://modules/franchises/FEAT-005-franchise-analytics#data
set -euo pipefail
mkdir -p /home/deploy/.cache
exec 9>/home/deploy/.cache/fantasy-franchises.lock
flock -n 9 || exit 0
exec python3 "$(dirname "$(readlink -f "$0")")/franchises-job.py"
