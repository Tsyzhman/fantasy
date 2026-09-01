#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 UPLOADED_CONFIG EXPECTED_SHA256" >&2
  exit 2
fi

uploaded_config="$1"
expected_sha="$2"
vpn_container="sharovik-vpn"
relay_container="fantasy-scout-fpl-relay"
web_container="fantasy-scout-web"
relay_volume="fantasy-scout-fpl-relay"
relay_socket="/run/fpl-relay/fpl.sock"
config_root="/var/backups/fantasy-scout/fpl-vpn-config"
# AYastrebov/docker-amneziawg v1.0.20260223, linux/amd64, source revision
# cb83840e9d34a5e0d6b874dcb42bc2ca23cd3ea4. Pin the platform manifest rather
# than the mutable release tag, which was rebuilt with a different client.
awg_image="ghcr.io/ayastrebov/docker-amneziawg@sha256:cac6c54caf5d749267386629cd827fc711524092156cd8097c8f464797a903be"
awg_image_revision="cb83840e9d34a5e0d6b874dcb42bc2ca23cd3ea4"
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
candidate_container="${vpn_container}-candidate-${stamp}"
candidate_config_volume="${vpn_container}-config-${stamp}"
rollback_container="${vpn_container}-rollback-${stamp}"
config_volume_created=0
candidate_started=0
old_vpn_renamed=0
new_vpn_active=0
completed=0
app_image=""
relay_timeout_ms="15000"
validate_only="${AMNEZIAWG_VALIDATE_ONLY:-0}"
allow_bootstrap="${AMNEZIAWG_ALLOW_BOOTSTRAP:-0}"
vpn_was_present=0
promotion_mode="rotation"

[[ "$allow_bootstrap" =~ ^[01]$ ]] || {
  echo "AMNEZIAWG_ALLOW_BOOTSTRAP must be 0 or 1." >&2
  exit 2
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

validate_config() {
  local file="$1"
  local size
  size="$(stat -c '%s' "$file")"
  [[ "$size" =~ ^[0-9]+$ && "$size" -ge 100 && "$size" -le 16384 ]] || {
    echo "AmneziaWG config has an invalid size." >&2
    return 1
  }
  grep -Iq . "$file" || {
    echo "AmneziaWG config contains binary data." >&2
    return 1
  }
  awk '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    BEGIN {
      section = ""
      interfaces = 0
      peers = 0
      interface_allowed = " PrivateKey Address DNS MTU Jc Jmin Jmax S1 S2 S3 S4 H1 H2 H3 H4 "
      peer_allowed = " PublicKey PresharedKey Endpoint AllowedIPs PersistentKeepalive "
    }
    {
      sub(/\r$/, "")
      if ($0 ~ /^[[:space:]]*($|#|;)/) next
      if ($0 ~ /^[[:space:]]*\[[^]]+\][[:space:]]*$/) {
        value = $0
        gsub(/[[:space:]\[\]]/, "", value)
        section = value
        if (section == "Interface") interfaces++
        else if (section == "Peer") peers++
        else exit 10
        next
      }
      separator = index($0, "=")
      if (!separator || section == "") exit 11
      key = trim(substr($0, 1, separator - 1))
      value = trim(substr($0, separator + 1))
      if (value == "") exit 12
      if (section == "Interface") {
        if (index(interface_allowed, " " key " ") == 0) exit 13
        interface_keys[key]++
      } else {
        if (index(peer_allowed, " " key " ") == 0) exit 14
        peer_keys[key]++
      }
    }
    END {
      if (interfaces != 1 || peers != 1) exit 20
      split("PrivateKey Address Jc Jmin Jmax S1 S2 S3 S4 H1 H2 H3 H4", required_interface, " ")
      for (key in required_interface) if (interface_keys[required_interface[key]] != 1) exit 21
      split("PublicKey PresharedKey Endpoint AllowedIPs PersistentKeepalive", required_peer, " ")
      for (key in required_peer) if (peer_keys[required_peer[key]] != 1) exit 22
    }
  ' "$file" || {
    echo "AmneziaWG config failed the allowlisted structure check." >&2
    return 1
  }
  grep -Eiq '^[[:space:]]*AllowedIPs[[:space:]]*=.*(^|[[:space:],])0\.0\.0\.0/0([[:space:],]|$)' "$file" || {
    echo "AmneziaWG config must route IPv4 through the tunnel." >&2
    return 1
  }
}

probe_vpn_namespace() {
  local target_container="$1"
  local probe="const c=new AbortController();const t=setTimeout(()=>c.abort(),10000);fetch('https://fantasy.premierleague.com/api/bootstrap-static/',{signal:c.signal}).then(async r=>{const b=await r.arrayBuffer();clearTimeout(t);process.exit(r.status===200&&b.byteLength>=100000?0:1)}).catch(()=>process.exit(1))"
  local attempt
  local max_attempts=6
  local latest_handshake transfer rx_bytes tx_bytes handshake
  for attempt in $(seq 1 "$max_attempts"); do
    if timeout --signal=TERM --kill-after=5s 15s docker run --rm \
      --network "container:$target_container" \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --entrypoint node \
      "$app_image" \
      -e "$probe" >/dev/null 2>&1
    then
      echo "AmneziaWG candidate passed the official FPL bootstrap probe on attempt $attempt/$max_attempts."
      return 0
    fi
    latest_handshake="$({ docker exec "$target_container" awg show awg0 latest-handshakes || true; } 2>/dev/null \
      | awk '{ if ($2 > latest) latest = $2 } END { printf "%.0f", latest + 0 }')"
    transfer="$({ docker exec "$target_container" awg show awg0 transfer || true; } 2>/dev/null \
      | awk '{ rx += $2; tx += $3 } END { printf "%.0f %.0f", rx + 0, tx + 0 }')"
    read -r rx_bytes tx_bytes <<< "${transfer:-0 0}"
    handshake="no"
    if [[ "$latest_handshake" =~ ^[0-9]+$ && "$latest_handshake" -gt 0 ]]; then
      handshake="yes"
    fi
    printf 'AmneziaWG FPL probe attempt %d/%d failed: handshake=%s rxBytes=%s txBytes=%s.\n' \
      "$attempt" "$max_attempts" "$handshake" "${rx_bytes:-0}" "${tx_bytes:-0}" >&2
    if (( attempt < max_attempts )); then
      sleep 2
    fi
  done
  return 1
}

start_relay() {
  local target_vpn="$1"
  docker volume create "$relay_volume" >/dev/null
  docker run -d \
    --name "$relay_container" \
    --restart unless-stopped \
    --network "container:$target_vpn" \
    -e "FPL_RELAY_SOCKET_PATH=$relay_socket" \
    -e "FPL_RELAY_UPSTREAM_TIMEOUT_MS=$relay_timeout_ms" \
    --mount "type=volume,src=$relay_volume,dst=/run/fpl-relay" \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --no-healthcheck \
    --entrypoint node \
    "$app_image" \
    scripts/fpl-vpn-relay.mjs >/dev/null
}

probe_relay() {
  local probe="const h=require('node:http');const q=h.request({socketPath:'$relay_socket',path:'/api/bootstrap-static/'},r=>{let n=0;r.on('data',c=>n+=c.length);r.on('end',()=>process.exit(r.statusCode===200&&n>=100000?0:1))});q.on('error',()=>process.exit(1));q.end()"
  local attempt
  for attempt in $(seq 1 6); do
    if timeout --signal=TERM --kill-after=5s 12s docker run --rm \
      --network none \
      --mount "type=volume,src=$relay_volume,dst=/run/fpl-relay,readonly" \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --entrypoint node \
      "$app_image" \
      -e "$probe" >/dev/null 2>&1
    then
      return 0
    fi
    sleep 2
  done
  return 1
}

restore_old_runtime() {
  set +e
  docker container rm -f "$relay_container" >/dev/null 2>&1 || true
  if (( new_vpn_active == 1 )) && container_exists "$vpn_container"; then
    docker container rm -f "$vpn_container" >/dev/null 2>&1 || true
  fi
  if (( old_vpn_renamed == 1 )) && container_exists "$rollback_container"; then
    docker container rename "$rollback_container" "$vpn_container" >/dev/null 2>&1 || true
    docker container start "$vpn_container" >/dev/null 2>&1 || true
    start_relay "$vpn_container" >/dev/null 2>&1 || true
  fi
  if container_exists "$candidate_container"; then
    docker container rm -f "$candidate_container" >/dev/null 2>&1 || true
  fi
  if (( config_volume_created == 1 )); then
    docker volume rm "$candidate_config_volume" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local exit_code=$?
  set +e
  rm -f -- "$uploaded_config"
  if (( completed == 0 )); then
    if (( new_vpn_active == 1 || old_vpn_renamed == 1 )); then
      restore_old_runtime
    elif (( candidate_started == 1 )) && container_exists "$candidate_container"; then
      docker container rm -f "$candidate_container" >/dev/null 2>&1 || true
    fi
    if (( config_volume_created == 1 )); then
      docker volume rm "$candidate_config_volume" >/dev/null 2>&1 || true
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

[[ "$uploaded_config" =~ ^/tmp/fantasy-scout-fpl-amneziawg-[0-9]+-[0-9]+\.conf$ ]] || {
  echo "Uploaded config path is outside the bounded temporary path." >&2
  exit 2
}
[[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
  echo "Invalid AmneziaWG config SHA-256." >&2
  exit 2
}
[[ -f "$uploaded_config" && ! -L "$uploaded_config" ]] || {
  echo "Uploaded AmneziaWG config is missing or is not a regular file." >&2
  exit 1
}
chmod 600 "$uploaded_config"
actual_sha="$(sha256sum "$uploaded_config" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || {
  echo "Uploaded AmneziaWG config checksum mismatch." >&2
  exit 1
}
validate_config "$uploaded_config"
if [[ "$validate_only" == "1" ]]; then
  completed=1
  printf '{"status":"valid","configSha256":"%s"}\n' "$expected_sha"
  exit 0
fi

[[ "$(uname -m)" == "x86_64" ]] || {
  echo "Pinned AmneziaWG image is approved only for the production amd64 host." >&2
  exit 1
}
[[ -c /dev/net/tun ]] || {
  echo "Production host has no /dev/net/tun device." >&2
  exit 1
}
container_exists "$web_container" || {
  echo "Production web container is missing." >&2
  exit 1
}
[[ "$(docker container inspect "$web_container" --format '{{.State.Running}}')" == "true" ]] || {
  echo "Production web container is not running." >&2
  exit 1
}
if container_exists "$vpn_container"; then
  vpn_was_present=1
elif [[ "$allow_bootstrap" == "1" ]]; then
  promotion_mode="bootstrap"
  echo "Existing FPL VPN container is missing; guarded bootstrap is enabled."
else
  echo "Existing FPL VPN container is missing; refusing an unguarded first install." >&2
  exit 1
fi
candidate_pattern="^${vpn_container}-candidate-[0-9]{8}T[0-9]{6}Z-[0-9]+$"
while IFS= read -r stale_candidate; do
  [[ "$stale_candidate" =~ $candidate_pattern ]] || continue
  [[ "$(docker container inspect "$stale_candidate" --format '{{ index .Config.Labels "com.fantasy-scout.role" }}' 2>/dev/null || true)" == "fpl-vpn" ]] || continue
  docker container rm -f "$stale_candidate" >/dev/null
  echo "Removed stale bounded AmneziaWG candidate $stale_candidate."
done < <(docker ps -a --format '{{.Names}}')
config_volume_pattern="^${vpn_container}-config-[0-9]{8}T[0-9]{6}Z-[0-9]+$"
while IFS= read -r stale_volume; do
  [[ "$stale_volume" =~ $config_volume_pattern ]] || continue
  if docker volume rm "$stale_volume" >/dev/null 2>&1; then
    echo "Removed stale bounded AmneziaWG config volume $stale_volume."
  fi
done < <(docker volume ls --filter label=com.fantasy-scout.role=fpl-vpn-config --format '{{.Name}}')
[[ -z "$(docker ps -aq --filter "name=^/${candidate_container}$")" ]] || {
  echo "AmneziaWG candidate container already exists." >&2
  exit 1
}
[[ -z "$(docker volume ls -q --filter "name=^${candidate_config_volume}$")" ]] || {
  echo "AmneziaWG candidate config volume already exists." >&2
  exit 1
}

app_image="$(docker container inspect "$web_container" --format '{{.Config.Image}}')"
docker image inspect "$app_image" >/dev/null
configured_timeout="$({ docker container inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' || true; } \
  | awk -F= '$1 == "FPL_PRICE_SYNC_TIMEOUT_MS" {print $2}' | tail -n 1)"
if [[ "$configured_timeout" =~ ^[0-9]+$ && "$configured_timeout" -ge 1000 && "$configured_timeout" -le 60000 ]]; then
  relay_timeout_ms="$configured_timeout"
fi

docker pull "$awg_image" >/dev/null
[[ "$(docker image inspect "$awg_image" --format '{{.Architecture}}')" == "amd64" ]] || {
  echo "Pinned AmneziaWG image is not linux/amd64." >&2
  exit 1
}
[[ "$(docker image inspect "$awg_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')" == "$awg_image_revision" ]] || {
  echo "Pinned AmneziaWG image revision does not match the reviewed source." >&2
  exit 1
}

docker volume create \
  --label com.fantasy-scout.role=fpl-vpn-config \
  --label "com.fantasy-scout.config-sha256=$expected_sha" \
  "$candidate_config_volume" >/dev/null
config_volume_created=1
docker run --rm -i \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount "type=volume,src=$candidate_config_volume,dst=/config" \
  --entrypoint /bin/sh \
  "$awg_image" \
  -c 'set -eu; umask 077; mkdir -p /config/wg_confs; cat > /config/wg_confs/awg0.conf; chmod 600 /config/wg_confs/awg0.conf' \
  < "$uploaded_config"

docker run -d \
  --name "$candidate_container" \
  --restart unless-stopped \
  --cap-add NET_ADMIN \
  --device /dev/net/tun \
  --sysctl net.ipv4.conf.all.src_valid_mark=1 \
  --sysctl net.ipv4.ip_forward=1 \
  --mount "type=volume,src=$candidate_config_volume,dst=/config" \
  -e LOG_CONFS=false \
  --label com.fantasy-scout.role=fpl-vpn \
  --label "com.fantasy-scout.config-sha256=$expected_sha" \
  --label "com.fantasy-scout.source-revision=$awg_image_revision" \
  "$awg_image" >/dev/null
candidate_started=1

probe_vpn_namespace "$candidate_container" || {
  docker logs --tail 80 "$candidate_container" >&2 || true
  echo "AmneziaWG candidate failed the official FPL bootstrap probe." >&2
  exit 1
}

docker container rm -f "$relay_container" >/dev/null 2>&1 || true
if (( vpn_was_present == 1 )); then
  docker container stop -t 20 "$vpn_container" >/dev/null
  docker container rename "$vpn_container" "$rollback_container"
  old_vpn_renamed=1
fi
docker container rename "$candidate_container" "$vpn_container"
candidate_started=0
new_vpn_active=1

start_relay "$vpn_container"
probe_relay || {
  docker logs --tail 80 "$relay_container" >&2 || true
  echo "FPL relay failed after the AmneziaWG swap." >&2
  exit 1
}

if (( old_vpn_renamed == 1 )); then
  docker container rm -f "$rollback_container" >/dev/null
  old_vpn_renamed=0
fi
new_vpn_active=0
config_volume_created=0
completed=1

if [[ -d "$config_root" ]]; then
  while IFS= read -r old_config; do
    [[ "$(realpath -m -- "$old_config")" == "$config_root/"* ]] || continue
    rm -f -- "$old_config" || echo "Warning: could not remove stale bounded VPN config." >&2
  done < <(find "$config_root" -maxdepth 1 -type f -name 'awg0-*.conf' -print)
fi
while IFS= read -r old_volume; do
  [[ "$old_volume" == "$candidate_config_volume" ]] && continue
  [[ "$old_volume" =~ $config_volume_pattern ]] || continue
  docker volume rm "$old_volume" >/dev/null 2>&1 || true
done < <(docker volume ls --filter label=com.fantasy-scout.role=fpl-vpn-config --format '{{.Name}}')

printf '{"status":"ok","mode":"%s","container":"%s","configSha256":"%s","image":"%s","fplProbe":"ok"}\n' \
  "$promotion_mode" "$vpn_container" "$expected_sha" "$awg_image"
