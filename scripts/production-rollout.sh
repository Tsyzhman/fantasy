#!/usr/bin/env bash
# @spec spec://common/INFRA-006-continuous-deployment#runtime
# Dependencies: the driver supplies create_production_worker, wait_for_release,
# switch_web_traffic and probe_public_release. A candidate is already serving.
promote_running_candidate() {
  phase="swap"
  docker container rename "$web" "$web_rollback"
  old_web_renamed=1
  docker container rename "$web_candidate" "$web"
  candidate_web_promoted=1

  docker container rename "$fpl_relay" "$fpl_relay_rollback"
  old_fpl_relay_renamed=1
  docker container rename "$fpl_relay_candidate" "$fpl_relay"
  candidate_relay_promoted=1
  docker container update --restart unless-stopped "$fpl_relay" >/dev/null

  # Keep the serving web and its relay running; only workers are exclusive.
  docker container stop -t 30 "$worker" >/dev/null
  docker container rename "$worker" "$worker_rollback"
  old_worker_renamed=1
  create_production_worker
  new_worker_created=1
  docker container start "$worker" >/dev/null
  wait_for_release "$worker" "$commit"
  [[ "$(docker container inspect "$worker" --format '{{.RestartCount}}')" == "0" ]]
  [[ "$(docker container inspect "$web" --format '{{.RestartCount}}')" == "0" ]]

  switch_web_traffic "$old_port" "$candidate_port"
  traffic_switched=1
  probe_public_release "$commit"
}

# @spec spec://common/INFRA-006-continuous-deployment#recovery
rollback_swap() {
  # Restore traffic before removing any candidate. If routing cannot recover,
  # preserve both web versions and their images for operator recovery.
  if (( traffic_switched == 1 )); then
    switch_web_traffic "$candidate_port" "$old_port" || return 1
    traffic_switched=0
  fi
  if (( new_worker_created == 1 )); then
    docker container stop -t 30 "$worker" >/dev/null || return 1
    docker container rm "$worker" >/dev/null || return 1
    new_worker_created=0
  fi
  if (( candidate_web_promoted == 1 )); then
    docker container rename "$web" "$web_candidate" || return 1
    candidate_web_promoted=0
  fi
  if (( old_web_renamed == 1 )); then
    docker container rename "$web_rollback" "$web" || return 1
    old_web_renamed=0
  fi
  if (( candidate_relay_promoted == 1 )); then
    docker container rename "$fpl_relay" "$fpl_relay_candidate" || return 1
    candidate_relay_promoted=0
  fi
  if (( old_fpl_relay_renamed == 1 )); then
    docker container rename "$fpl_relay_rollback" "$fpl_relay" || return 1
    old_fpl_relay_renamed=0
  fi
  if (( old_worker_renamed == 1 )); then
    docker container rename "$worker_rollback" "$worker" || return 1
    old_worker_renamed=0
    docker container start "$worker" >/dev/null || return 1
  elif [[ "$(docker container inspect "$worker" --format '{{.State.Running}}')" != "true" ]]; then
    docker container start "$worker" >/dev/null || return 1
  fi
  probe_public_release "$old_commit" || return 1
}

# @spec spec://common/INFRA-006-continuous-deployment#runtime
drain_previous_runtime() {
  echo "Traffic verified; draining the previous web for 30 seconds."
  sleep 30
  docker container stop -t 30 "$web_rollback" >/dev/null
  docker container stop -t 10 "$fpl_relay_rollback" >/dev/null
}
