#!/usr/bin/env bash
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
image="fantasy-scout:$release"
target="$release_root/$release"
expected_archive="/tmp/fantasy-scout-release-$release.tar.gz"
canary="fantasy-scout-canary-$release"
web_rollback="fantasy-scout-web-rollback-pre-$release"
worker_rollback="fantasy-scout-worker-rollback-pre-$release"
web_env="$(mktemp)"
worker_env="$(mktemp)"
phase="prepare"
old_web_renamed=0
old_worker_renamed=0
target_created=0
image_created=0
old_current_target=""

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

rollback_swap() {
  set +e
  docker container rm -f "$web" "$worker" >/dev/null 2>&1 || true
  if (( old_web_renamed == 1 )) && container_exists "$web_rollback"; then
    docker container rename "$web_rollback" "$web"
    docker container start "$web" >/dev/null
  fi
  if (( old_worker_renamed == 1 )) && container_exists "$worker_rollback"; then
    docker container rename "$worker_rollback" "$worker"
    docker container start "$worker" >/dev/null
  fi
}

cleanup() {
  exit_code=$?
  set +e
  docker container rm -f "$canary" >/dev/null 2>&1 || true
  rm -f -- "$web_env" "$worker_env"

  if (( exit_code != 0 )); then
    if [[ "$phase" == "deployed" ]]; then
      exit "$exit_code"
    fi
    if [[ "$phase" == "swap" ]]; then
      rollback_swap
      if [[ -n "$old_current_target" ]] \
        && [[ "$(readlink -f "$current_link" 2>/dev/null || true)" == "$target" ]]
      then
        rollback_link="/var/www/.fantasy-scout-current-rollback-$release"
        ln -s "$old_current_target" "$rollback_link"
        mv -Tf "$rollback_link" "$current_link"
      fi
    fi
    if (( image_created == 1 )); then
      docker image rm "$image" >/dev/null 2>&1 || true
    fi
    if (( target_created == 1 )) && [[ "$(realpath -m -- "$target")" == "$release_root/$release" ]]; then
      rm -rf -- "$target"
    fi
  else
    rm -f -- "$archive"
  fi
  exit "$exit_code"
}
trap cleanup EXIT

validate_inputs

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
for migration in "${expected_migrations[@]}"; do
  printf '%s\n' "${applied_migrations[@]}" | grep -Fxq "$migration" || {
    echo "Refusing application deploy with unapplied migration: $migration" >&2
    exit 1
  }
done

docker build \
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

docker container inspect "$web" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^APP_RELEASE_(COMMIT|VERSION)=' > "$web_env"
docker container inspect "$worker" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^APP_RELEASE_(COMMIT|VERSION)=' > "$worker_env"
chmod 600 "$web_env" "$worker_env"

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
  --network fantasy-scout_default \
  --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads,readonly \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  "$image" >/dev/null

canary_healthy=0
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
  echo "Release canary did not become healthy with the requested commit." >&2
  exit 1
}
docker container rm -f "$canary" >/dev/null

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

phase="swap"
docker container stop -t 30 "$worker" "$web" >/dev/null
docker container rename "$web" "$web_rollback"
old_web_renamed=1
docker container rename "$worker" "$worker_rollback"
old_worker_renamed=1

docker create \
  --name "$web" \
  --restart unless-stopped \
  --env-file "$web_env" \
  --network fantasy-scout_default \
  --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads \
  -p 127.0.0.1:3000:3000 \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  "$image" >/dev/null

docker create \
  --name "$worker" \
  --restart unless-stopped \
  --env-file "$worker_env" \
  --network fantasy-scout_default \
  --mount type=volume,src=fantasy-scout_fantasy-scout-uploads,dst=/app/storage/uploads \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  "$image" >/dev/null

docker container start "$web" "$worker" >/dev/null
production_healthy=0
for attempt in $(seq 1 40); do
  if docker exec "$web" node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const p=await r.json();process.exit(r.ok&&p.release?.commit===process.argv[1]?0:1)}).catch(()=>process.exit(1))" \
    "$commit" \
    && docker exec "$worker" node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const p=await r.json();process.exit(r.ok&&p.release?.commit===process.argv[1]?0:1)}).catch(()=>process.exit(1))" \
      "$commit"
  then
    production_healthy=1
    break
  fi
  sleep 2
done
[[ "$production_healthy" -eq 1 ]] || {
  echo "New production containers did not become healthy with the requested commit." >&2
  exit 1
}
[[ "$(docker container inspect "$web" --format '{{.RestartCount}}')" == "0" ]] || {
  echo "New web container restarted during promotion." >&2
  exit 1
}
[[ "$(docker container inspect "$worker" --format '{{.RestartCount}}')" == "0" ]] || {
  echo "New worker container restarted during promotion." >&2
  exit 1
}

link_tmp="/var/www/.fantasy-scout-current-$release"
ln -s "$target" "$link_tmp"
mv -Tf "$link_tmp" "$current_link"
phase="deployed"

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

printf 'DEPLOYED_RELEASE=%s\n' "$release"
printf 'DEPLOYED_VERSION=%s\n' "$version"
printf 'DEPLOYED_COMMIT=%s\n' "$commit"
printf 'DEPLOYED_TREE=%s\n' "$tree"
printf 'DEPLOYED_IMAGE=%s\n' "$image_id"
printf 'PREVIOUS_IMAGE=%s\n' "$previous_release"
