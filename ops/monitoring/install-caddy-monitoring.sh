#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
	echo "Usage: $0 <expected-caddyfile-sha256> <payload-directory>" >&2
	exit 64
fi

expected_hash="$1"
payload_directory="$(realpath "$2")"
caddyfile="/etc/caddy/Caddyfile"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="${caddyfile}.pre-fantasy-monitoring-${timestamp}"

actual_hash="$(sha256sum "$caddyfile" | awk '{print $1}')"
if [[ "$actual_hash" != "$expected_hash" ]]; then
	echo "Refusing to edit $caddyfile: expected $expected_hash, found $actual_hash" >&2
	exit 65
fi

for required in \
	"$payload_directory/analyze_caddy_access_log.py" \
	"$payload_directory/fantasy-monitoring.caddy" \
	"$payload_directory/fantasy-access-audit.service" \
	"$payload_directory/fantasy-access-audit.timer"; do
	if [[ ! -f "$required" ]]; then
		echo "Missing payload file: $required" >&2
		exit 66
	fi
done

cp --preserve=mode,ownership,timestamps "$caddyfile" "$backup"
install -d -o root -g root -m 0755 /usr/local/lib/fantasy-scout
install -o root -g root -m 0755 \
	"$payload_directory/analyze_caddy_access_log.py" \
	/usr/local/lib/fantasy-scout/analyze-caddy-access-log.py
install -d -o caddy -g caddy -m 0755 /var/log/caddy
if [[ ! -e /var/log/caddy/fantasy-access.log ]]; then
	install -o caddy -g caddy -m 0640 /dev/null /var/log/caddy/fantasy-access.log
else
	chown caddy:caddy /var/log/caddy/fantasy-access.log
	chmod 0640 /var/log/caddy/fantasy-access.log
fi
install -d -o caddy -g caddy -m 0750 /var/lib/fantasy-scout-monitor
install -o root -g root -m 0644 \
	"$payload_directory/fantasy-access-audit.service" \
	/etc/systemd/system/fantasy-access-audit.service
install -o root -g root -m 0644 \
	"$payload_directory/fantasy-access-audit.timer" \
	/etc/systemd/system/fantasy-access-audit.timer

python3 - "$caddyfile" "$payload_directory/fantasy-monitoring.caddy" <<'PY'
from pathlib import Path
import sys

caddyfile = Path(sys.argv[1])
snippet_path = Path(sys.argv[2])
text = caddyfile.read_text(encoding="utf-8")
old = "fantasy.tsyzhman.ru {\n\timport ai_common\n\treverse_proxy 127.0.0.1:3000\n}"
if text.count(old) != 1:
    raise SystemExit("Refusing to edit: the expected fantasy site block is not unique")

snippet = snippet_path.read_text(encoding="utf-8").strip()
indented_snippet = "\n".join(f"\t{line}" if line else "" for line in snippet.splitlines())
new = f"fantasy.tsyzhman.ru {{\n\timport ai_common\n\n{indented_snippet}\n\n\treverse_proxy 127.0.0.1:3000\n}}"
caddyfile.write_text(text.replace(old, new), encoding="utf-8")
PY

restore_caddyfile() {
	cp --preserve=mode,ownership,timestamps "$backup" "$caddyfile"
	caddy validate --config "$caddyfile" >/dev/null
	systemctl reload caddy
}

if ! caddy validate --config "$caddyfile"; then
	restore_caddyfile
	echo "Caddy validation failed; restored $backup" >&2
	exit 67
fi

if ! systemctl reload caddy; then
	restore_caddyfile
	echo "Caddy reload failed; restored $backup" >&2
	exit 68
fi

systemctl daemon-reload
systemctl enable --now fantasy-access-audit.timer

echo "Installed monitoring; Caddy backup: $backup"
