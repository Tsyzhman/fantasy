#!/usr/bin/env bash
set -euo pipefail

analyzer="${FANTASY_ACCESS_ANALYZER:-/usr/local/lib/fantasy-scout/analyze-caddy-access-log.py}"
monitor_directory="${FANTASY_MONITOR_DIRECTORY:-/var/lib/fantasy-scout-monitor}"
window_start_file="$monitor_directory/beta-access-window-start"
rolling_output="$monitor_directory/access-audit.json"
slo_output="$monitor_directory/rolling-slo-audit.json"
fixed_output="$monitor_directory/beta-access-audit.json"

if [[ ! -e "$window_start_file" ]]; then
	temporary_start="$(mktemp "$monitor_directory/.beta-access-window-start.XXXXXX")" || exit 1
	trap 'rm -f "$temporary_start"' EXIT
	date --utc --iso-8601=seconds >"$temporary_start" || exit 1
	chmod 0644 "$temporary_start" || exit 1
	# Keep an operator-provided start if it appeared while this process was preparing one.
	mv --no-clobber "$temporary_start" "$window_start_file" || exit 1
	rm -f "$temporary_start"
	trap - EXIT
fi

window_start="$(head -n 1 "$window_start_file")"
if [[ -z "$window_start" ]]; then
	echo "Fixed beta access-window start is empty: $window_start_file" >&2
	exit 1
fi

common_arguments=(
	--log-pattern '/var/log/caddy/fantasy-access*.log*'
	--max-5xx-rate-percent 1
	--min-requests 20
	--exclude-path /api/health/data-quality
	--exclude-path /api/health/fantasy-prices
	--exclude-user-agent-prefix fantasy-scout-production-monitor/1.0
	--exclude-user-agent-prefix fantasy-production-browser-smoke/
)

set +e
/usr/bin/python3 "$analyzer" \
	"${common_arguments[@]}" \
	--since-minutes 60 \
	--output "$rolling_output"
rolling_status=$?

/usr/bin/python3 "$analyzer" \
	"${common_arguments[@]}" \
	--since-minutes 1440 \
	--output "$slo_output"
slo_status=$?

/usr/bin/python3 "$analyzer" \
	"${common_arguments[@]}" \
	--window-start "$window_start" \
	--output "$fixed_output"
fixed_status=$?
set -e

# The fixed snapshot is retained beta evidence, not a replacement alert policy.
# Preserve the existing rolling breach exit status; only an analyzer/runtime error
# in the fixed pass may additionally fail the service.
if [[ $fixed_status -ne 0 && $fixed_status -ne 3 ]]; then
	exit "$fixed_status"
fi
if [[ $slo_status -ne 0 ]]; then exit "$slo_status"; fi
exit "$rolling_status"
