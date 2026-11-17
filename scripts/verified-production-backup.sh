#!/usr/bin/env bash
# @spec spec://common/INFRA-006-continuous-deployment#recovery
set -euo pipefail
umask 077
exec 9>"/home/deploy/.cache/fantasy-production-deploy.lock"
flock -w 1800 9
root=/var/backups/fantasy-scout
source_db=fantasy-scout-postgres
release=$(basename "$(readlink -e /var/www/fantasy-scout-current)")
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z-(v[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{7,40})$ ]]
target="$root/snapshot-$(date -u +%Y%m%dT%H%M%SZ)-${BASH_REMATCH[1]}.dump"
partial=$(mktemp "$root/.verified-backup.XXXXXX")
verifier=
cleanup() {
  if [[ -n $verifier ]]; then docker rm -fv "$verifier" >/dev/null; fi
  rm -f -- "$partial"
}
trap cleanup EXIT
docker exec "$source_db" pg_dump -U fantasy_app -d fantasy_scout -Fc --no-owner --no-acl > "$partial"
image=$(docker inspect -f '{{.Image}}' "$source_db")
verifier=$(docker run -d --network none --memory 768m --cpus 0.75 --label fantasy-scout.role=backup-verifier -e POSTGRES_HOST_AUTH_METHOD=trust "$image")
for attempt in {1..90}; do
  if docker exec "$verifier" psql -U postgres -Atqc 'select 1' >/dev/null 2>&1 && docker exec "$verifier" test -f /var/lib/postgresql/data/postmaster.pid && docker exec "$verifier" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
  sleep 1
done
started=$SECONDS
docker exec -i "$verifier" pg_restore -h 127.0.0.1 -U postgres -d postgres --exit-on-error --no-owner --no-acl < "$partial"
tables=$(docker exec "$verifier" psql -U postgres -Atqc "select count(*) from pg_tables where schemaname = 'public'")
[[ $tables =~ ^[1-9][0-9]*$ ]]
docker exec "$verifier" psql -U postgres -v ON_ERROR_STOP=1 -Atqc 'select count(*) from _prisma_migrations'
mv -T -- "$partial" "$target"
echo "Verified $target tables=$tables restore_seconds=$((SECONDS-started)) bytes=$(stat -c %s "$target")"