#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 ARCHIVE SHA256 RELEASE COMMIT" >&2
  exit 2
fi

archive="$1"
expected_sha="$2"
release="$3"
commit="$4"

work_root="/tmp/fantasy-scout-price-sync-$release"
target="$work_root/source"
expected_archive="/tmp/fantasy-scout-price-sync-$release.tar.gz"
web="fantasy-scout-web"
image="fantasy-scout-price-sync:$release"
container="fantasy-scout-price-sync-$release"
web_env="$(mktemp)"
build_log="$(mktemp)"
target_created=0
image_created=0

cleanup() {
  local exit_code=$?
  set +e
  docker container rm -f "$container" >/dev/null 2>&1 || true
  if (( image_created == 1 )); then
    docker image rm "$image" >/dev/null 2>&1 || true
  fi
  rm -f -- "$web_env" "$build_log"
  if (( target_created == 1 )) && [[ "$(realpath -m -- "$work_root")" == "/tmp/fantasy-scout-price-sync-$release" ]]; then
    rm -rf -- "$work_root"
  fi
  rm -f -- "$archive"
  exit "$exit_code"
}
trap cleanup EXIT

[[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z-v[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{7,40}$ ]] || {
  echo "Invalid release name." >&2
  exit 2
}
[[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
  echo "Invalid archive SHA-256." >&2
  exit 2
}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Invalid commit." >&2
  exit 2
}
[[ "$archive" == "$expected_archive" ]] || {
  echo "Archive path is outside the bounded price-sync path." >&2
  exit 2
}
[[ -f "$archive" ]] || {
  echo "Price-sync archive is missing." >&2
  exit 1
}
[[ ! -e "$work_root" ]] || {
  echo "Price-sync work directory already exists." >&2
  exit 1
}
docker container inspect "$web" >/dev/null 2>&1 || {
  echo "Production web container is missing." >&2
  exit 1
}
[[ "$(docker inspect "$web" --format '{{.State.Running}}')" == "true" ]] || {
  echo "Production web container is not running." >&2
  exit 1
}
if docker container inspect "$container" >/dev/null 2>&1; then
  echo "Price-sync container name is already in use." >&2
  exit 1
fi

actual_sha="$(sha256sum "$archive" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || {
  echo "Archive SHA-256 mismatch." >&2
  exit 1
}

mkdir -p "$target"
target_created=1
tar --extract --gzip --file "$archive" --directory "$target" --no-same-owner
[[ ! -e "$target/.git" ]] || {
  echo "Archive unexpectedly contains .git." >&2
  exit 1
}
[[ -f "$target/scripts/sync-production-fantasy-prices.ts" ]] || {
  echo "Price-sync entrypoint is missing from the archive." >&2
  exit 1
}

docker container inspect "$web" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$web_env"
chmod 600 "$web_env"
grep -q '^DATABASE_URL=' "$web_env" || {
  echo "Production web environment has no DATABASE_URL." >&2
  exit 1
}

if ! docker build --target setup --tag "$image" "$target" > "$build_log" 2>&1; then
  tail -n 120 "$build_log" >&2 || true
  echo "Temporary price-sync image build failed." >&2
  exit 1
fi
image_created=1

docker run --rm \
  --name "$container" \
  --env-file "$web_env" \
  --network fantasy-scout_default \
  "$image" \
  npm run prices:sync-fpl-and-epl

echo "PRICE_SYNC_COMPLETED release=$release commit=$commit"
