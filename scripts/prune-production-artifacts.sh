#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

mode="dry-run"
if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 2
fi

release_root_input="${FANTASY_RELEASE_ROOT:-/var/www/fantasy-scout-releases}"
current_link="${FANTASY_CURRENT_LINK:-/var/www/fantasy-scout-current}"
keep_recent="${FANTASY_RELEASE_KEEP_RECENT:-3}"
build_cache_limit="${FANTASY_BUILD_CACHE_LIMIT:-1GB}"

if [[ ! "$keep_recent" =~ ^[1-9][0-9]*$ ]]; then
  echo "FANTASY_RELEASE_KEEP_RECENT must be a positive integer." >&2
  exit 2
fi
if [[ ! -d "$release_root_input" || ! -L "$current_link" ]]; then
  echo "Release root or current-release symlink is missing." >&2
  exit 1
fi

release_root="$(realpath -e -- "$release_root_input")"
current_target="$(realpath -e -- "$current_link")"
expected_release_root="/var/www/fantasy-scout-releases"
expected_current_link="/var/www/fantasy-scout-current"
if [[ "$release_root" != "$expected_release_root" ]]; then
  echo "Refusing unexpected release root: $release_root" >&2
  exit 1
fi
if [[ "$current_link" != "$expected_current_link" ]]; then
  echo "Refusing unexpected current-release link: $current_link" >&2
  exit 1
fi
case "$current_target" in
  "$release_root"/*) ;;
  *)
    echo "Current release is outside the release root: $current_target" >&2
    exit 1
    ;;
esac

release_remove_command=(rm -rf --)
if [[ "$EUID" -ne 0 ]] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  release_remove_command=(sudo -n rm -rf --)
fi

echo "MODE=$mode"
echo "RELEASE_ROOT=$release_root"
echo "CURRENT_RELEASE=$current_target"

mapfile -t rollback_rows < <(
  docker container ls -a --format '{{.Names}}|{{.CreatedAt}}' |
    awk -F'|' '$1 ~ /^fantasy-scout-web-rollback-/ { print }' |
    sort -t'|' -k2,2r
)

if (( ${#rollback_rows[@]} > 0 )); then
  echo "KEEP_ROLLBACK=${rollback_rows[0]%%|*}"
fi
for row in "${rollback_rows[@]:1}"; do
  rollback_name="${row%%|*}"
  [[ "$rollback_name" =~ ^fantasy-scout-web-rollback-[a-zA-Z0-9._-]+$ ]] || {
    echo "Refusing unexpected rollback name: $rollback_name" >&2
    exit 1
  }
  rollback_state="$(
    docker container inspect "$rollback_name" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["State"]["Status"])'
  )"
  if [[ "$rollback_state" != "created" && "$rollback_state" != "exited" && "$rollback_state" != "dead" ]]; then
    echo "SKIP_ROLLBACK=$rollback_name|state=$rollback_state"
    continue
  fi
  echo "REMOVE_ROLLBACK=$rollback_name|state=$rollback_state"
  if [[ "$mode" == "apply" ]]; then
    docker container rm "$rollback_name" >/dev/null
  fi
done

declare -A protected_releases=()
protected_releases["$(basename -- "$current_target")"]=1

while IFS= read -r image_ref; do
  [[ "$image_ref" == fantasy-scout:* ]] || continue
  release_name="${image_ref#fantasy-scout:}"
  if [[ -d "$release_root/$release_name" ]]; then
    protected_releases["$release_name"]=1
  fi
done < <(docker container ls -a --format '{{.Image}}')

mapfile -t newest_releases < <(
  find "$release_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@|%f\n' |
    sort -rn |
    awk -F'|' -v keep="$keep_recent" 'NR <= keep { print $2 }'
)
for release_name in "${newest_releases[@]}"; do
  protected_releases["$release_name"]=1
done

while IFS= read -r release_path; do
  release_name="$(basename -- "$release_path")"
  if [[ -n "${protected_releases[$release_name]:-}" ]]; then
    echo "KEEP_RELEASE=$release_name"
    continue
  fi
  resolved_release="$(realpath -e -- "$release_path")"
  if [[ "$(dirname -- "$resolved_release")" != "$release_root" || "$resolved_release" == "$current_target" ]]; then
    echo "Refusing unsafe release target: $resolved_release" >&2
    exit 1
  fi
  release_size="$(du -sh "$resolved_release" | cut -f1)"
  echo "REMOVE_RELEASE=$release_name|size=$release_size"
  if [[ "$mode" == "apply" ]]; then
    "${release_remove_command[@]}" "$resolved_release"
  fi
done < <(find "$release_root" -mindepth 1 -maxdepth 1 -type d -print | sort)

declare -A used_image_ids=()
while IFS= read -r container_id; do
  [[ -n "$container_id" ]] || continue
  image_id="$(
    docker container inspect "$container_id" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["Image"])'
  )"
  used_image_ids["$image_id"]=1
done < <(docker container ls -aq)

while IFS= read -r image_ref; do
  [[ "$image_ref" == fantasy-scout:* && "$image_ref" != *":<none>" ]] || continue
  image_id="$(
    docker image inspect "$image_ref" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["Id"])'
  )"
  if [[ -n "${used_image_ids[$image_id]:-}" ]]; then
    echo "KEEP_IMAGE=$image_ref"
    continue
  fi
  echo "REMOVE_IMAGE=$image_ref"
  if [[ "$mode" == "apply" ]]; then
    docker image rm "$image_ref" >/dev/null
  fi
done < <(docker image ls fantasy-scout --format '{{.Repository}}:{{.Tag}}' | sort -u)

if [[ "$mode" == "apply" ]]; then
  docker builder prune --force --max-used-space "$build_cache_limit"
else
  echo "PRUNE_BUILD_CACHE=max-used-space:$build_cache_limit"
fi

echo "RELEASE_COUNT=$(find "$release_root" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
docker system df
