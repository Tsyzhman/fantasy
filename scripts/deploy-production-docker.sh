#!/usr/bin/env bash
# @spec spec://common/INFRA-006-continuous-deployment#root
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

if [[ $# -ne 6 ]]; then
  echo "Usage: $0 ARCHIVE SHA256 RELEASE COMMIT TREE VERSION" >&2
  exit 2
fi

archive="$1"
expected_sha="$2"
release="$3"
commit="$4"
tree="$5"
version="$6"

release_root="/var/www/fantasy-scout-releases"
current_link="/var/www/fantasy-scout-current"
web="fantasy-scout-web"
worker="fantasy-scout-worker"
postgres="fantasy-scout-postgres"
fpl_relay="fantasy-scout-fpl-relay"
fpl_vpn_container="${FPL_VPN_CONTAINER_NAME:-sharovik-vpn}"
fpl_relay_candidate_volume="fantasy-scout-fpl-relay-candidate-$release"
fpl_relay_socket="/run/fpl-relay/fpl.sock"
image="fantasy-scout:$release"
target="$release_root/$release"
expected_archive="/tmp/fantasy-scout-release-$release.tar.gz"
canary="fantasy-scout-canary-$release"
web_candidate="fantasy-scout-web-candidate-$release"
static_current="fantasy-scout-static-current-$release"
static_previous="fantasy-scout-static-previous-$release"
web_rollback="fantasy-scout-web-rollback-pre-$release"
worker_rollback="fantasy-scout-worker-rollback-pre-$release"
fpl_relay_candidate="fantasy-scout-fpl-relay-candidate-$release"
fpl_relay_rollback="fantasy-scout-fpl-relay-rollback-pre-$release"
web_env="$(mktemp)"
worker_env="$(mktemp)"
rehearsal_env="$(mktemp)"
build_log="$(mktemp)"
phase="prepare"
old_web_renamed=0
old_worker_renamed=0
old_fpl_relay_renamed=0
target_created=0
image_created=0
setup_image_created=0
rehearsal_created=0
rehearsal_db=""
schema_migration_attempted=0
old_current_target=""
candidate_web_promoted=0
candidate_relay_promoted=0
new_worker_created=0
traffic_switched=0
old_port=""
candidate_port=""
old_commit=""

validate_inputs() {
  [[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z-v[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{7,40}$ ]] || {
    echo "Invalid release name: $release" >&2
    exit 2
  }
  [[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
    echo "Invalid archive SHA-256." >&2
    exit 2
  }
  [[ "$commit" =~ ^[0-9a-f]{40}$ && "$tree" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Commit and tree must be full Git object IDs." >&2
    exit 2
  }
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Invalid semantic version: $version" >&2
    exit 2
  }
  [[ "$fpl_vpn_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || {
    echo "Invalid FPL VPN container name." >&2
    exit 2
  }
  [[ "$archive" == "$expected_archive" ]] || {
    echo "Archive must use the exact bounded path $expected_archive." >&2
    exit 2
  }
  [[ -d "$release_root" && -L "$current_link" ]] || {
    echo "Immutable release root or current symlink is missing." >&2
    exit 1
  }
  [[ ! -e "$target" ]] || {
    echo "Release target already exists: $target" >&2
    exit 1
  }
  [[ -f "$archive" ]] || {
    echo "Release archive is missing: $archive" >&2
    exit 1
  }
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

migration_in_list() {
  local needle="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$needle" ]] && return 0
  done
  return 1
}

run_docker_build() {
  local label="$1"
  shift

  if ! docker build "$@" >"$build_log" 2>&1; then
    tail -n 120 "$build_log" >&2 || true
    echo "$label Docker build failed." >&2
    return 1
  fi
  : > "$build_log"
  echo "$label Docker build completed." >&2
}

run_canary() {
  local stage="$1"

  docker run -d \
    --name "$canary" \
    --env-file "$web_env" \
    -e INGESTION_WORKER_IN_PROCESS=false \
    -e MACHETE_DAILY_SYNC_ENABLED=false \
    -e LEAGUE_SEASON_RETENTION_ENABLED=false \
    -e DATA_QUALITY_AUDIT_ENABLED=false \
    -e SPORTS_RU_FANTASY_SYNC_ENABLED=false \
    -e FIXTURE_ODDS_SYNC_ENABLED=false \
    -e FOONTASY_SYNC_ENABLED=false \
    -e FPL_PRICE_SYNC_ENABLED=false \
    -e PROBABLE_LINEUP_SYNC_ENABLED=false \
    -e "FPL_RELAY_SOCKET_PATH=$fpl_relay_socket" \
    --network fantasy-scout_default \
    --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads,readonly \
    --mount "type=volume,src=$fpl_relay_candidate_volume,dst=/run/fpl-relay,readonly" \
    --log-driver json-file \
    --log-opt max-size=20m \
    --log-opt max-file=5 \
    "$image" >/dev/null

  local canary_healthy=0
  for attempt in $(seq 1 40); do
    if docker exec "$canary" node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const p=await r.json();process.exit(r.ok&&p.release?.commit===process.argv[1]?0:1)}).catch(()=>process.exit(1))" \
      "$commit"
    then
      canary_healthy=1
      break
    fi
    sleep 2
  done
  [[ "$canary_healthy" -eq 1 ]] || {
    docker logs --tail 200 "$canary" >&2 || true
    echo "$stage release canary did not become healthy with the requested commit." >&2
    return 1
  }
  docker container rm -f "$canary" >/dev/null
}

start_fpl_relay() {
  local name="$1"
  local volume="$2"
  local restart_policy="${3:-no}"

  docker volume create "$volume" >/dev/null
  docker run -d \
    --name "$name" \
    --restart "$restart_policy" \
    --network "container:$fpl_vpn_container" \
    -e "FPL_RELAY_SOCKET_PATH=$fpl_relay_socket" \
    -e "FPL_RELAY_UPSTREAM_TIMEOUT_MS=${FPL_PRICE_SYNC_TIMEOUT_MS:-15000}" \
    --mount "type=volume,src=$volume,dst=/run/fpl-relay" \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --log-driver json-file \
    --log-opt max-size=20m \
    --log-opt max-file=5 \
    --no-healthcheck \
    --entrypoint node \
    "$image" \
    scripts/fpl-vpn-relay.mjs >/dev/null
}

wait_for_fpl_relay() {
  local volume="$1"
  local expected_minimum_bytes="${2:-0}"
  local probe="const h=require('node:http');const q=h.request({socketPath:'$fpl_relay_socket',path:'/api/bootstrap-static/'},r=>{let n=0;r.on('data',c=>n+=c.length);r.on('end',()=>process.exit(r.statusCode===200&&n>=Number(process.argv[1])?0:1))});q.on('error',()=>process.exit(1));q.end()"

  for attempt in $(seq 1 20); do
    if docker run --rm \
      --network none \
      --mount "type=volume,src=$volume,dst=/run/fpl-relay,readonly" \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --entrypoint node \
      "$image" \
      -e "$probe" "$expected_minimum_bytes" >/dev/null 2>&1
    then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_release() {
  local name="$1" expected_commit="$2"
  for attempt in $(seq 1 40); do
    if docker exec "$name" node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const p=await r.json();process.exit(r.ok&&p.release?.commit===process.argv[1]?0:1)}).catch(()=>process.exit(1))" \
      "$expected_commit" >/dev/null 2>&1
    then
      echo "READY_CONTAINER=$name commit=$expected_commit"
      return 0
    fi
    sleep 2
  done
  echo "Container did not become healthy with the requested commit: $name" >&2
  return 1
}

switch_web_traffic() {
  sudo -n python3 "$target/scripts/production-web-routing.py" --from-port "$1" --to-port "$2"
}

probe_public_release() {
  local expected_commit="$1"
  curl -fsS --connect-timeout 3 --max-time 10 \
    --resolve fantasy.tsyzhman.ru:443:127.0.0.1 https://fantasy.tsyzhman.ru/api/health \
    | python3 -c 'import json,sys; p=json.load(sys.stdin); sys.exit(0 if p.get("status")=="ok" and p.get("release",{}).get("commit")==sys.argv[1] else 1)' "$expected_commit"
}

cleanup() {
  exit_code=$?
  trap '' HUP INT TERM
  set +e
  if (( exit_code != 0 )) && [[ "$phase" == "swap" ]]; then
    if ! rollback_swap; then
      echo "Traffic rollback needs recovery; both web versions and release artifacts were retained." >&2
      rm -f -- "$web_env" "$worker_env" "$rehearsal_env" "$build_log"
      exit "$exit_code"
    fi
    if [[ -n "$old_current_target" ]] && [[ "$(readlink -f "$current_link" 2>/dev/null || true)" == "$target" ]]; then
      rollback_link="/var/www/.fantasy-scout-current-rollback-$release"
      ln -s "$old_current_target" "$rollback_link"
      mv -Tf "$rollback_link" "$current_link"
    fi
  fi
  docker container rm -f "$canary" >/dev/null 2>&1 || true
  docker container rm -f "$static_current" "$static_previous" >/dev/null 2>&1 || true
  if (( exit_code != 0 )); then
    docker container rm -f "$web_candidate" >/dev/null 2>&1 || true
  fi
  if container_exists "$fpl_relay_candidate"; then
    docker container rm -f "$fpl_relay_candidate" >/dev/null 2>&1 || true
    docker volume rm "$fpl_relay_candidate_volume" >/dev/null 2>&1 || true
  fi
  if (( rehearsal_created == 1 )) && [[ -n "$rehearsal_db" ]]; then
    docker exec "$postgres" psql -U fantasy_app -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$rehearsal_db\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
  rm -f -- "$web_env" "$worker_env" "$rehearsal_env" "$build_log"

  if (( exit_code != 0 )); then
    if [[ "$phase" == "deployed" ]]; then
      exit "$exit_code"
    fi
    if (( schema_migration_attempted == 1 )); then
      echo "Only reviewed online migrations were attempted; serving old runtime was preserved. Inspect migration state before retrying." >&2
    fi
    if (( image_created == 1 )); then
      docker image rm "$image" >/dev/null 2>&1 || true
    fi
    if (( setup_image_created == 1 )); then
      docker image rm "$setup_image" >/dev/null 2>&1 || true
    fi
    if (( target_created == 1 )) && [[ "$(realpath -m -- "$target")" == "$release_root/$release" ]]; then
      rm -rf -- "$target"
    fi
  else
    if (( setup_image_created == 1 )); then
      docker image rm "$setup_image" >/dev/null 2>&1 || true
    fi
    rm -f -- "$archive"
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_inputs

exec 7>/home/deploy/.cache/fantasy-production-deploy.lock
flock -n 7 || { echo "Another production promotion is active." >&2; exit 1; }

actual_sha="$(sha256sum "$archive" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || {
  echo "Archive SHA-256 mismatch: expected $expected_sha, got $actual_sha." >&2
  exit 1
}

mkdir "$target"
target_created=1
tar --extract --gzip --file "$archive" --directory "$target" --no-same-owner

for required_file in \
  Dockerfile \
  package.json \
  scripts/deploy-production-docker.sh \
  scripts/production-rollout.sh \
  scripts/production-web-routing.py \
  scripts/check-online-migrations.py \
  src/server/web-scheduler-activation.ts \
  scripts/fpl-vpn-relay.mjs \
  scripts/prune-production-artifacts.sh \
  src/app/api/machete/squads/formula-adaptations/route.ts \
  src/components/machete/FormulaAdaptationHoverCard.tsx \
  src/machete/formula-adaptation-models.generated.json \
  src/machete/formula_adaptations.ts
do
  [[ -f "$target/$required_file" ]] || {
    echo "Required release file is missing: $required_file" >&2
    exit 1
  }
done

source "$target/scripts/production-rollout.sh"
[[ ! -e "$target/.git" ]] || {
  echo "Release archive unexpectedly contains .git." >&2
  exit 1
}

archive_version="$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' \
    "$target/package.json"
)"
[[ "$archive_version" == "$version" ]] || {
  echo "Archive version $archive_version does not match requested version $version." >&2
  exit 1
}

printf '%s\n' "$release" > "$target/.release-name"
printf '%s\n' "$version" > "$target/.release-version"
printf '%s\n' "$commit" > "$target/.release-commit"
printf '%s\n' "$tree" > "$target/.release-tree"
printf '%s\n' "$expected_sha" > "$target/.release-archive-sha256"

mapfile -t expected_migrations < <(
  find "$target/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
)
mapfile -t applied_migrations < <(
  docker exec "$postgres" psql -U fantasy_app -d fantasy_scout -Atc \
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
)

docker container inspect "$web" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^APP_RELEASE_(COMMIT|VERSION)=' > "$web_env"
docker container inspect "$worker" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^APP_RELEASE_(COMMIT|VERSION)=' > "$worker_env"
chmod 600 "$web_env" "$worker_env"

# @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime
# Keep account credentials out of release archives and the public web runtime.
sorare_env="/home/deploy/.config/fantasy-scout/sorareinside.env"
if [[ -f "$sorare_env" ]]; then
  [[ "$(stat -c '%a' "$sorare_env")" == "600" ]] || { echo "SorareInside config must be mode 600" >&2; exit 1; }
  sed -i '/^SORAREINSIDE_/d' "$worker_env"
  grep -E '^SORAREINSIDE_(SYNC_ENABLED|EMAIL|PASSWORD)=' "$sorare_env" >> "$worker_env"
fi
sed -i '/^SORAREINSIDE_/d' "$web_env"

# @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime
# Keep the corroborating price refresh scopes in operator-owned configuration.
sports_ru_env="/home/deploy/.config/fantasy-scout/sports-ru.env"
if [[ -f "$sports_ru_env" ]]; then
  [[ "$(stat -c '%a' "$sports_ru_env")" == "600" ]] || { echo "Sports.ru config must be mode 600" >&2; exit 1; }
  sed -i '/^SPORTS_RU_FANTASY_SYNC_/d' "$worker_env"
  grep -E '^SPORTS_RU_FANTASY_SYNC_(ENABLED|SCOPES|INTERVAL_HOURS)=' "$sports_ru_env" >> "$worker_env"
fi

# @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
# Operator-owned notification flags and secrets stay outside Git and release archives.
notifications_env="/home/deploy/.config/fantasy-scout/notifications.env"
if [[ -f "$notifications_env" ]]; then
  [[ "$(stat -c '%a' "$notifications_env")" == "600" ]] || { echo "Notification config must be mode 600" >&2; exit 1; }
  for runtime_env in "$web_env" "$worker_env"; do
    sed -i -E '/^(TELEGRAM_|SPORTS_TRENDS_)/d' "$runtime_env"
    grep -E '^(TELEGRAM_|SPORTS_TRENDS_)[A-Z0-9_]+=' "$notifications_env" >> "$runtime_env"
  done
fi

# Public KHL catalog and local drafts are enabled independently of forecasts.
# Explicit production configuration survives subsequent immutable releases.
for runtime_env in "$web_env" "$worker_env"; do
  sed -i '/^KHL_ENABLED=/d; /^KHL_SYNC_ENABLED=/d; /^KHL_CATALOG_CONTEST_IDS=/d; /^KHL_FORECASTS_ENABLED=/d; /^KHL_STATS_SYNC_ENABLED=/d; /^KHL_DAILY_STATS_ENABLED=/d' "$runtime_env"
  printf '%s\n' 'KHL_ENABLED=true' 'KHL_SYNC_ENABLED=true' 'KHL_CATALOG_CONTEST_IDS=107' 'KHL_FORECASTS_ENABLED=false' 'KHL_STATS_SYNC_ENABLED=true' 'KHL_DAILY_STATS_ENABLED=true' >> "$runtime_env"
done

docker container inspect "$fpl_vpn_container" >/dev/null 2>&1 || {
  echo "FPL VPN container is missing: $fpl_vpn_container" >&2
  exit 1
}
[[ "$(docker container inspect "$fpl_vpn_container" --format '{{.State.Running}}')" == "true" ]] || {
  echo "FPL VPN container is not running: $fpl_vpn_container" >&2
  exit 1
}
[[ -z "$(docker ps -aq --filter "name=^/${fpl_relay_candidate}$")" ]] || {
  echo "FPL relay candidate name already exists: $fpl_relay_candidate" >&2
  exit 1
}

pending_migrations=()
for migration in "${expected_migrations[@]}"; do
  if ! migration_in_list "$migration" "${applied_migrations[@]}"; then
    pending_migrations+=("$migration")
  fi
done

# A migration without exact reviewed compatibility must never trigger downtime.
python3 "$target/scripts/check-online-migrations.py" "$target/prisma/migrations" "${pending_migrations[@]}"
old_port="$(python3 "$target/scripts/production-web-routing.py" --current-port)"
published_port="$(docker container inspect "$web" --format '{{range (index .NetworkSettings.Ports "3000/tcp")}}{{.HostPort}}{{end}}')"
[[ "$published_port" == "$old_port" ]] || { echo "Serving web port disagrees with Caddy." >&2; exit 1; }
published_host="$(docker container inspect "$web" --format '{{range (index .NetworkSettings.Ports "3000/tcp")}}{{.HostIp}}{{end}}')"
[[ "$published_host" == "127.0.0.1" ]] || { echo "Serving web must use a bounded loopback binding." >&2; exit 1; }
if [[ "$old_port" == "3000" ]]; then candidate_port=3001; else candidate_port=3000; fi
old_commit="$(cat "$current_link/.release-commit")"
probe_public_release "$old_commit"

run_docker_build "Runtime" \
  --target runtime \
  --build-arg "APP_RELEASE_VERSION=$version" \
  --build-arg "APP_RELEASE_COMMIT=$commit" \
  --label "org.opencontainers.image.source=https://github.com/Tsyzhman/fantasy" \
  --label "org.opencontainers.image.revision=$commit" \
  --label "org.opencontainers.image.version=$version" \
  --tag "$image" \
  "$target"
image_created=1

image_commit="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
image_version="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
[[ "$image_commit" == "$commit" && "$image_version" == "$version" ]] || {
  echo "Built image release labels do not match the requested source." >&2
  exit 1
}

start_fpl_relay "$fpl_relay_candidate" "$fpl_relay_candidate_volume"
wait_for_fpl_relay "$fpl_relay_candidate_volume" 100000 || {
  docker logs --tail 40 "$fpl_relay_candidate" >&2 || true
  echo "FPL VPN relay candidate failed its official bootstrap probe." >&2
  exit 1
}

run_canary "Pre-migration"

# @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
# Share the full-source collector lock before any migration or worker stop.
# Keep it until promotion/rollback exits, so a scheduled collector waits safely.
mkdir -p /home/deploy/.cache
exec 9>/home/deploy/.cache/fantasy-khl-daily.lock
echo "Waiting for any active KHL statistics collection before replacing containers."
flock -w 1800 9 || { echo "KHL collection is still active; production was not stopped." >&2; exit 1; }
# @spec spec://modules/franchises/FEAT-005-franchise-analytics#data
# Hold the same lock as the franchise timer before touching worker identity.
exec 8>/home/deploy/.cache/fantasy-franchises.lock
flock -w 1800 8 || { echo "Franchise collection is still active; production was not stopped." >&2; exit 1; }

if (( ${#pending_migrations[@]} > 0 )); then
  active_jobs_before_migration="$(
    docker exec "$postgres" psql -U fantasy_app -d fantasy_scout -Atc \
      "SELECT count(*) FROM ingestion_jobs WHERE status IN ('queued','running')"
  )"
  [[ "$active_jobs_before_migration" == "0" ]] || {
    echo "Refusing migration while $active_jobs_before_migration ingestion job(s) are active." >&2
    exit 1
  }

  backup_root="/var/backups/fantasy-scout"
  backup_path="$backup_root/pre-${release}-migration.dump"
  mkdir -p "$backup_root"
  umask 077
  docker exec "$postgres" pg_dump -U fantasy_app -d fantasy_scout \
    --format=custom --no-owner --no-acl > "$backup_path"
  [[ -s "$backup_path" ]] || {
    echo "Production database backup is empty: $backup_path" >&2
    exit 1
  }
  docker exec -i "$postgres" pg_restore --list < "$backup_path" >/dev/null
  backup_sha="$(sha256sum "$backup_path" | awk '{print $1}')"
  echo "Verified production backup: $backup_path ($backup_sha)"

  setup_image="$image-setup"
  run_docker_build "Migration setup" \
    --target setup \
    --tag "$setup_image" \
    "$target"
  setup_image_created=1

  rehearsal_db="fantasy_scout_migration_${release//[^a-zA-Z0-9]/_}"
  docker exec "$postgres" psql -U fantasy_app -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$rehearsal_db\""
  rehearsal_created=1
  docker exec -i "$postgres" pg_restore \
    -U fantasy_app -d "$rehearsal_db" --no-owner --no-acl --exit-on-error \
    < "$backup_path"

  python3 - "$web_env" "$rehearsal_env" "$rehearsal_db" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

source_path, target_path, database_name = sys.argv[1:]
lines = []
database_url_seen = False
with open(source_path, encoding="utf-8") as source:
    for raw_line in source:
        if raw_line.startswith("DATABASE_URL="):
            database_url_seen = True
            value = raw_line.rstrip("\r\n").split("=", 1)[1]
            parsed = urlsplit(value)
            value = urlunsplit((parsed.scheme, parsed.netloc, "/" + database_name, parsed.query, parsed.fragment))
            raw_line = "DATABASE_URL=" + value + "\n"
        lines.append(raw_line)
if not database_url_seen:
    raise SystemExit("DATABASE_URL is missing from the active web container environment")
with open(target_path, "w", encoding="utf-8") as target:
    target.writelines(lines)
PY
  chmod 600 "$rehearsal_env"

  migration_container="fantasy-scout-migration-rehearsal-$release"
  docker run --rm --name "$migration_container" \
    --env-file "$rehearsal_env" \
    --network fantasy-scout_default \
    "$setup_image" npm run prisma:migrate:deploy
  rehearsal_applied="$(
    docker exec "$postgres" psql -U fantasy_app -d "$rehearsal_db" -Atc \
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
  )"
  [[ "$rehearsal_applied" == "${#expected_migrations[@]}" ]] || {
    echo "Migration rehearsal did not apply the complete migration set: $rehearsal_applied/${#expected_migrations[@]}" >&2
    exit 1
  }
  docker exec "$postgres" psql -U fantasy_app -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$rehearsal_db\" WITH (FORCE)" >/dev/null
  rehearsal_created=0
  rehearsal_db=""

  schema_migration_attempted=1
  docker run --rm --name "fantasy-scout-migration-$release" \
    --env-file "$web_env" \
    --network fantasy-scout_default \
    "$setup_image" npm run prisma:migrate:deploy
  setup_image_created=0
  docker image rm "$setup_image" >/dev/null

  mapfile -t applied_migrations < <(
    docker exec "$postgres" psql -U fantasy_app -d fantasy_scout -Atc \
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
  )
  for migration in "${expected_migrations[@]}"; do
    migration_in_list "$migration" "${applied_migrations[@]}" || {
      echo "Production migration did not apply: $migration" >&2
      exit 1
    }
  done
  echo "Applied production migrations: ${#applied_migrations[@]}"
  probe_public_release "$old_commit"
fi

if (( ${#pending_migrations[@]} > 0 )); then
  run_canary "Post-migration"
fi

active_jobs="$(
  docker exec "$postgres" psql -U fantasy_app -d fantasy_scout -Atc \
    "SELECT count(*) FROM ingestion_jobs WHERE status IN ('queued','running')"
)"
[[ "$active_jobs" == "0" ]] || {
  echo "Refusing to replace the worker while $active_jobs ingestion job(s) are active." >&2
  exit 1
}

for active in "$web" "$worker"; do
    [[ "$(docker container inspect "$active" --format '{{.State.Status}}')" == "running" ]] || {
      echo "Active container is not running: $active" >&2
      exit 1
    }
    [[ "$(docker container inspect "$active" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')" == "healthy" ]] || {
      echo "Active container is not healthy: $active" >&2
      exit 1
    }
done
old_current_target="$(readlink -f "$current_link")"
[[ "$old_current_target" == "$release_root/"* && -d "$old_current_target" ]] || {
  echo "Current release target is invalid: $old_current_target" >&2
  exit 1
}
[[ -z "$(docker ps -aq --filter "name=^/${web_rollback}$")" ]] || {
  echo "Rollback name already exists: $web_rollback" >&2
  exit 1
}
[[ -z "$(docker ps -aq --filter "name=^/${worker_rollback}$")" ]] || {
  echo "Rollback name already exists: $worker_rollback" >&2
  exit 1
}
[[ -z "$(docker ps -aq --filter "name=^/${fpl_relay_rollback}$")" ]] || {
  echo "FPL relay rollback name already exists: $fpl_relay_rollback" >&2
  exit 1
}

# Extract original image assets, not an accumulated runtime asset cache.
# Each release contains assets from precisely the current and previous images.
mkdir "$target/runtime-static"
chmod 755 "$target/runtime-static"
previous_image="$(docker container inspect "$web" --format '{{.Config.Image}}')"
docker create --name "$static_previous" --entrypoint true "$previous_image" >/dev/null
docker cp "$static_previous:/app/.next/static/." "$target/runtime-static/"
docker container rm "$static_previous" >/dev/null
docker create --name "$static_current" --entrypoint true "$image" >/dev/null
docker cp "$static_current:/app/.next/static/." "$target/runtime-static/"
docker container rm "$static_current" >/dev/null
printf '%s\n%s\n' "$image" "$previous_image" > "$target/.release-static-images"
: > "$target/.web-schedulers-active"
chmod 644 "$target/.web-schedulers-active"

docker create \
  --name "$web_candidate" \
  --restart unless-stopped \
  --env-file "$web_env" \
  -e INGESTION_WORKER_IN_PROCESS=false \
  -e WEB_SCHEDULER_ACTIVATION_PATH=/run/fantasy-scout/web-schedulers-active \
  -e "FPL_RELAY_SOCKET_PATH=$fpl_relay_socket" \
  --network fantasy-scout_default \
  --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads \
  --mount "type=volume,src=$fpl_relay_candidate_volume,dst=/run/fpl-relay,readonly" \
  --mount "type=bind,src=$target/runtime-static,dst=/app/.next/static,readonly" \
  --mount "type=bind,src=$target/.web-schedulers-active,dst=/run/fantasy-scout/web-schedulers-active,readonly" \
  -p "127.0.0.1:$candidate_port:3000" \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  "$image" >/dev/null

docker container start "$web_candidate" >/dev/null
wait_for_release "$web_candidate" "$commit"
docker exec "$web_candidate" node -e 'const fs=require("node:fs");fs.accessSync(process.env.WEB_SCHEDULER_ACTIVATION_PATH,fs.constants.R_OK);fs.accessSync("/app/.next/static",fs.constants.R_OK|fs.constants.X_OK)'

create_production_worker() {
docker create \
  --name "$worker" \
  --restart unless-stopped \
  --env-file "$worker_env" \
  -e INGESTION_WORKER_IN_PROCESS=true \
  -e FPL_PRICE_SYNC_ENABLED=false \
  -e PROBABLE_LINEUP_SYNC_ENABLED=false \
  -e "FPL_RELAY_SOCKET_PATH=$fpl_relay_socket" \
  --network fantasy-scout_default \
  --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads \
  --mount type=volume,src=fantasy-scout-franchises,dst=/app/storage/franchises \
  --mount "type=volume,src=$fpl_relay_candidate_volume,dst=/run/fpl-relay,readonly" \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  "$image" >/dev/null
}

activate_web_schedulers() {
  printf '%s\n' "$commit" > "$target/.web-schedulers-active"
  echo "WEB_SCHEDULERS_ACTIVATED=$commit"
}

promote_running_candidate

link_tmp="/var/www/.fantasy-scout-current-$release"
ln -s "$target" "$link_tmp"
mv -Tf "$link_tmp" "$current_link"
phase="deployed"
drain_previous_runtime

# Timer follows the immutable current-release symlink; one service and flock
# prevent overlapping full source refreshes. Forecast/odds cadence stays in worker.
sudo install -m 0644 "$target/ops/fantasy-khl-statistics.service" /etc/systemd/system/fantasy-khl-statistics.service
sudo install -m 0644 "$target/ops/fantasy-khl-statistics.timer" /etc/systemd/system/fantasy-khl-statistics.timer
sudo systemctl daemon-reload
sudo systemctl enable --now fantasy-khl-statistics.timer

previous_release="$(basename "$(docker container inspect "$web_rollback" --format '{{.Config.Image}}')")"
image_id="$(docker image inspect "$image" --format '{{.Id}}')"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$release" \
  "$version" \
  "$commit" \
  "$tree" \
  "$image_id" \
  >> "$release_root/PRODUCTION_HISTORY.tsv"

# Retention is part of a successful promotion, not a separate operator task.
# Keep the active release plus exactly one stopped rollback and bound BuildKit
# cache growth after every production image build.
"$target/scripts/prune-production-artifacts.sh" --apply

printf 'DEPLOYED_RELEASE=%s\n' "$release"
printf 'DEPLOYED_VERSION=%s\n' "$version"
printf 'DEPLOYED_COMMIT=%s\n' "$commit"
printf 'DEPLOYED_TREE=%s\n' "$tree"
printf 'DEPLOYED_IMAGE=%s\n' "$image_id"
printf 'PREVIOUS_IMAGE=%s\n' "$previous_release"
