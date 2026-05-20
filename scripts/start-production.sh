#!/usr/bin/env bash
set -euo pipefail

cd /var/www/fantasy-scout

set -a
source /var/www/fantasy-scout/.env
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"

exec npm start
