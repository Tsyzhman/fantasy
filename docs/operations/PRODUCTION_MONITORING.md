# Production monitoring

The scheduled monitor checks public application health/login, client critical errors, data-quality, Sports price and FPL health. Source checks share active scopes with synchronization; archives retain integrity/count diagnostics without an ongoing freshness SLA. Reviewed exclusions include reasons; unresolved mappings and real freshness/coverage failures remain warnings. Application unavailability stays critical. GitHub API operations retain bounded retries and existing issue deduplication.

## Error windows

The host access-audit timer produces an hourly snapshot and `rolling-slo-audit.json` for the preceding 24 hours, with the existing <1% eligible 5xx threshold and minimum 20 requests. The 24-hour check also requires an exact 1440-minute window, fresh generation, retained start and recent coverage end. Truncated/missing log history cannot pass. Synthetic monitor/browser-canary traffic and expected source-health failures stay excluded from user-traffic metrics.

Exclude the exact `/api/health`, `/api/health/fpl`, `/api/health/data-quality` and `/api/health/fantasy-prices` paths from both the numerator and denominator. Their availability/quality results are checked separately. Frequent successful health probes must never dilute a real user-traffic breach.

`beta-access-audit.json` preserves fixed beta-start evidence and is never relabeled as a complete window after logs expire. A separate beta acceptance run can enable `MONITOR_FIXED_WINDOW_ENABLED=true` with exact start/minimum observed span; those strict checks remain. Ordinary operations use the rolling SLO. Review JSON results, not only the workflow exit status.

## Correlation and resources

Caddy assigns `X-Request-ID` and appends the UUID, actual upstream and release commit to bounded logs. Application errors contain that ID, PID and commit without headers, bodies or query parameters. Minute diagnostics contain CPU, RSS, heap/external memory and event-loop p95/max. SQL uses at most 128 hashed fingerprints/top 20 summaries, reset every five minutes, without bind values. Worker diagnostics report actual interval deltas of PostgreSQL temp bytes/files.

PostgreSQL slow statements (500 ms) and temp files (10 MiB) use disabled bind-parameter lengths, bounded Docker rotation and reloadable settings. Diagnose relevant operations before changing memory settings. Cumulative `pg_stat_database.temp_bytes` is not a one-hour measurement. No preload extension or PostgreSQL restart is required. Prior unexplained 502s stay unexplained unless correlated evidence establishes a cause.

```bash
docker stats --no-stream fantasy-scout-web fantasy-scout-worker fantasy-scout-postgres
docker inspect fantasy-scout-web fantasy-scout-worker --format '{{.Name}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}'
journalctl -u fantasy-access-audit.service -n 5 --no-pager
curl -fsS https://fantasy.tsyzhman.ru/_monitor/rolling-slo-audit.json
```

Inspect windows around full imports/simultaneous web generations, one active worker, duplicate jobs/ownership buckets, finite cache/retention budgets and orphan canaries. Hourly session cleanup deletes only expired sessions and preserves active logins. [Deployment](DEPLOYMENT.md) owns budgets, exact revisions and rollback. [Historical fixed-window notes](archive/PRODUCTION_MONITORING-before-WI-072.md) preserve earlier evidence.
