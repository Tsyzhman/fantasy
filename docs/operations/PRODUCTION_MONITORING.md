# Production monitoring

The production monitoring path has three independent layers. A failure in a
quality gate must not restart an otherwise healthy web process.

## External checks

`.github/workflows/production-monitor.yml` runs every 15 minutes and can also be
started manually. It checks:

- `/api/health` and `/login` as critical availability checks;
- `/api/health/client-errors` as a warning-level zero-tolerance check over the
  recent sanitized browser-error window;
- `/api/health/data-quality` as a warning-level freshness and coverage gate;
- `/_monitor/access-audit.json` as a warning-level server-error and latency
  snapshot;
- `/_monitor/beta-access-audit.json` as the retained fixed-start beta error-rate
  evidence window. It is warning-level and never replaces critical liveness.

The monitor keeps one GitHub issue named
`[production-monitor] Fantasy Scout alert`. It opens or updates the issue only
when the failure fingerprint changes, reopens it on a recurring incident, and
closes it after recovery. Critical availability failures also fail the workflow;
quality warnings keep the workflow green while the issue remains open.
GitHub API reads (`GET`/`HEAD`) retry bounded network, 429 and 5xx failures.
Mutating `POST`/`PATCH` calls are never automatically retried, so a transient
response cannot duplicate issue mutations.

The browser reporter is mounted for public and authenticated screens and also
runs from both React error boundaries. It deduplicates each coarse kind/route
group in memory and fails silently if collection is unavailable. The request
omits credentials and referrer data. Collection intentionally stores no raw
message, stack, detailed path/query, user/session identifier, IP or user agent;
only minute-bucketed aggregate rows remain in PostgreSQL.
Accepted reports delete buckets older than 30 days; this retention cleanup runs
inside the same serialized transaction as the bounded write.
Anonymous request work is bounded in memory before database access, and the
database serializer uses a non-blocking advisory lock. Because a browser report
cannot carry a server-held secret, this signal is explicitly unverified and may
be spoofed; it opens a warning issue but cannot fail the availability workflow.

The retained fixed-window check is intentionally not self-approving. Configure
both repository variables before it can become `OK`:

- `MONITOR_FIXED_WINDOW_EXPECTED_START` — the exact canonical `windowStart`
  expected in the served JSON, including milliseconds and timezone;
- `MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES` — the externally approved
  positive minimum observed span. The code has no fallback duration.

Missing, malformed, mismatched, or not-yet-reached values leave this check at
warning level. The workflow remains green for that warning, but the shared
alert issue remains open. Changing either variable changes the alert
fingerprint and must correspond to a recorded beta-gate decision; do not tune
it merely to make a run green.

Official fantasy prices are intentionally outside this monitor until the source
publishes them. The exception is explicit; no synthetic price health is reported
as green.

## Caddy access log audit

`ops/caddy/fantasy-monitoring.caddy` enables a dedicated JSON access log for
`fantasy.tsyzhman.ru`. Authentication and cookie headers keep Caddy's default
redaction. The file rotates at 50 MiB or every 24 hours, keeps ten files, and
removes files older than 30 days.

The reverse proxy has a two-second retry window with a 100 ms interval for
brief upstream disconnects. Caddy's default retry matcher keeps this to safe
GET requests; non-idempotent writes are not replayed.

`fantasy-access-audit.timer` runs every 15 minutes. Its wrapper produces two
separate aggregate, non-sensitive snapshots from active and compressed rotated
logs:

- `access-audit.json` retains the existing rolling 60-minute alert window;
- `beta-access-audit.json` starts at the exact timestamp retained in
  `/var/lib/fantasy-scout-monitor/beta-access-window-start` and reuses that
  start across runs. Its JSON records `windowMode: fixed_start` and
  `windowStart`, and omits
  `windowMinutes`; it therefore cannot claim an invented requested duration.

Both snapshots publish:

- request count and status-code counts;
- 4xx and 5xx totals;
- 5xx percentage;
- p50, p75, p95, and maximum response duration;
- first/last included request and the actual observed span, so a requested
  24-hour window cannot be mistaken for 24 hours of evidence when the log is
  newer;
- excluded request count and its User-Agent subset.

Fixed snapshots additionally publish `logCoverageStart`, `logCoverageEnd`, and
`retentionCoversWindowStart`. These are bounds of valid events actually present
in the retained active/rotated log set, before traffic exclusions. The fixed
production check requires `retentionCoversWindowStart=true`; an `ok` rate from
logs whose earliest retained event is later than the requested start remains a
warning because the missing prefix cannot be audited.

The GitHub production monitor reads both files. A stale, insufficient, or
breaching fixed beta window remains a warning in the shared alert issue even if
the latest rolling hour is clean; critical application availability behavior is
unchanged.

The state is `insufficient_data` below 20 requests, `breach` at a 5xx rate of
1% or more, and `ok` otherwise. A rolling breach makes the oneshot service fail;
the retained fixed result is evidence and a GitHub warning, not a replacement
for the rolling exit policy. The public aggregates are served from
`/_monitor/access-audit.json` and `/_monitor/beta-access-audit.json`. Requests to the
monitor path and the warning-only `/api/health/data-quality` and
`/api/health/fantasy-prices` endpoints are excluded from user-traffic metrics in
both Caddy and the analyzer. Their expected 503 responses therefore cannot
manufacture a user-facing 5xx breach. The scheduled production monitor and
production browser smoke are excluded by their dedicated User-Agents
(`fantasy-scout-production-monitor/1.0` and
`fantasy-production-browser-smoke/*`), while genuine user visits to `/login`
remain included in the user-traffic denominator.

The analyzer uses exit code `3` for a measured 5xx breach. Argument/configuration
errors retain argparse's nonzero code (normally `2`). The wrapper ignores only
fixed-pass code `3`, because a fixed breach is warning evidence; malformed
`beta-access-window-start` and every other fixed-pass error fail the oneshot
service. Rolling behavior is otherwise unchanged: its analyzer status is still
the wrapper's final status.

The wrapper passes the same excluded paths and synthetic User-Agent prefixes to
both snapshots. On its first run it atomically records the current UTC timestamp
if no retained start exists; later runs never overwrite a non-empty start. To
start a release window at an already known exact instant, seed the file before
the first timer run (the value must include a timezone):

```bash
printf '%s\n' '<exact-beta-window-start-with-timezone>' | \
  sudo tee /var/lib/fantasy-scout-monitor/beta-access-window-start >/dev/null
sudo chown caddy:caddy /var/lib/fantasy-scout-monitor/beta-access-window-start
sudo chmod 0644 /var/lib/fantasy-scout-monitor/beta-access-window-start
```

Do not backdate an unknown start. Resetting the file intentionally starts a new
evidence window; it discards continuity and must be recorded in the release
audit. A fixed snapshot can only read events still present in Caddy's retained
logs, so the reported retention flag, coverage bounds, and observed span
together are the authoritative evidence. The GitHub check becomes `OK` only
when the served start exactly equals the repository variable, retained logs
cover that start, and the externally configured minimum observed span has been
reached. Its breach does not replace the rolling service exit policy: the
scheduled alert continues to follow the rolling 60-minute result.

The first verified beta36 snapshot after post-deploy smoke excluded 393 tagged
synthetic requests. It contained 2 eligible requests, 0 responses 5xx and an
observed span of 2.415 minutes, so the correct state was
`insufficient_data`. Production Monitor run `29563899169` remained green with
0 critical failures and one warning for that insufficient sample.

The fresh post-rotation snapshot used by run `29566962197` excluded 399 tagged
synthetic requests and included 234 eligible requests, 0 responses 5xx,
p75/p95 22.767/50.482 ms and a 51.834-minute observed span. The state was `ok`
and the workflow had 0 critical failures and 0 warnings. The eligible-request
counter is an HTTP denominator, not proof of 234 people or even exclusively
human traffic. Neither snapshot closes the long-running real-user error-rate
gate.

The beta38 production run `29573699815` is deliberately not recorded as a clean
pass merely because GitHub marked the workflow green. It reported
`criticalFailures=0`, `warnings=1`, and `alertRequired=true`. The served snapshot
was `insufficient_data`: 14 eligible requests, 2 server errors (14.286%), and a
45.411-minute observed span. The two errors were `500 POST /` at 10:13 UTC;
beta38 started at 10:29 UTC, so they predate that release. From the successful
beta38 start through authenticated browser smoke, the raw Caddy window contained
206 requests and 0×5xx, while app/PostgreSQL/Caddy critical logs were 0. That raw
window includes tagged synthetic traffic and deployment diagnostics, so it is
release evidence only and cannot close the real-user error-rate gate. Do not
manufacture eligible requests to clear the warning; wait for genuine beta
traffic and let the scheduled audit update the issue.

Install or update the server integration only after recording the exact current
Caddyfile SHA-256:

```bash
sudo bash ops/monitoring/install-caddy-monitoring.sh \
  <expected-caddyfile-sha256> \
  <directory-containing-the-five-monitoring-payload-files>
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
curl -fsS https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json
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
