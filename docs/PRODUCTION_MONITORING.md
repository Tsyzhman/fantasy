# Production monitoring

The production monitoring path has three independent layers. A failure in a
quality gate must not restart an otherwise healthy web process.

## External checks

`.github/workflows/production-monitor.yml` runs every 15 minutes and can also be
started manually. It checks:

- `/api/health` and `/login` as critical availability checks;
- `/api/health/data-quality` as a warning-level freshness and coverage gate;
- `/_monitor/access-audit.json` as a warning-level server-error and latency
  snapshot.

The monitor keeps one GitHub issue named
`[production-monitor] Fantasy Scout alert`. It opens or updates the issue only
when the failure fingerprint changes, reopens it on a recurring incident, and
closes it after recovery. Critical availability failures also fail the workflow;
quality warnings keep the workflow green while the issue remains open.

Official fantasy prices are intentionally outside this monitor until the source
publishes them. The exception is explicit; no synthetic price health is reported
as green.

## Caddy access log audit

`ops/caddy/fantasy-monitoring.caddy` enables a dedicated JSON access log for
`fantasy.tsyzhman.ru`. Authentication and cookie headers keep Caddy's default
redaction. The file rotates at 50 MiB or every 24 hours, keeps ten files, and
removes files older than 30 days.

`fantasy-access-audit.timer` runs every 15 minutes. The analyzer reads the last
60 minutes from active and compressed rotated logs and publishes only aggregate,
non-sensitive metrics:

- request count and status-code counts;
- 4xx and 5xx totals;
- 5xx percentage;
- p50, p75, p95, and maximum response duration.

The state is `insufficient_data` below 20 requests, `breach` at a 5xx rate of
1% or more, and `ok` otherwise. A breach makes the oneshot service fail. The
public aggregate is served from `/_monitor/access-audit.json`. Requests to the
monitor path and the warning-only `/api/health/data-quality` and
`/api/health/fantasy-prices` endpoints are excluded from user-traffic metrics in
both Caddy and the analyzer. Their expected 503 responses therefore cannot
manufacture a user-facing 5xx breach.

Install or update the server integration only after recording the exact current
Caddyfile SHA-256:

```bash
sudo bash ops/monitoring/install-caddy-monitoring.sh \
  <expected-caddyfile-sha256> \
  <directory-containing-the-four-monitoring-payload-files>
```

The installer refuses a changed Caddyfile, supports a clean install and guarded
updates of its own marked or legacy block, creates a timestamped backup,
validates the new config, restores the backup if reload fails, normalizes the
log owner without truncating an existing log, and enables the systemd timer.

Verify:

```bash
systemctl is-active caddy
systemctl is-active fantasy-access-audit.timer
systemctl status fantasy-access-audit.service --no-pager
curl -fsS https://fantasy.tsyzhman.ru/_monitor/access-audit.json
```

## Container logs

Compose bounds PostgreSQL and web `json-file` logs to five files of 20 MiB.
Manual immutable-image rollouts must pass the same options to `docker create` or
`docker run`:

```bash
--log-opt max-size=20m --log-opt max-file=5
```

Do not print `.env`, `docker inspect .Config.Env`, authentication cookies, or
request headers while diagnosing an alert. Publish only status, timing, image
identity, and aggregate counters.
