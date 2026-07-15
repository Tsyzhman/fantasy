# Forecast And Data Quality Audit

Run the persisted quality audit for a league season with:

```bash
npm run prisma:migrate:deploy
npm run data:quality -- --league=47 --season=2025/2026
```

The command exits with code `2` when the beta gate fails. Use `--json` for
machine-readable output, `--no-persist` for exploration, or
`--allow-gate-failure` when a failed report should not fail the calling job.

## Exact Denominators

Forecast coverage uses every active `TeamPlayerSeason` row in the selected
league and season. A forecast is counted as available only when all of these
are present:

- at least one historical match row in the five-match projection window;
- a recognized `GK`, `DEF`, `MID`, or `FWD` position;
- a finite xFP result;
- finite expected minutes;
- a finite confidence heuristic;
- a valid last-data-update date.

The default required forecast coverage is 98%.

The confidence value is a heuristic, not a calibrated probability. It combines
sample size, stability of historical minutes, and availability of start flags.
The planner labels it as a heuristic and also exposes expected minutes,
historical start rate, positive factors, risks, model version, calculation date,
and source-data update date.

## Data Checks

- Active-player data coverage: active roster entries with at least one basic
  player-stat row.
- Finished-match coverage: normalized finished matches with at least one player
  stat row.
- Basic stat-row coverage: rows with a known position, numeric minutes, and at
  least one numeric performance field such as rating, goal, xG, tackle, save,
  or goals conceded.
- Promotion latency: time from the first stored `RawMatchPayload.createdAt` to
  the first normalized `MatchPlayerStat.createdAt` for the match.

Forecast, active-player, finished-match, and basic-row coverage must each be at
least 98% by default. Promotion latency is stricter: every finished match must
have comparable timestamps and be promoted within six hours. A missing raw
payload or an impossible timestamp order fails this check rather than being
silently excluded.

Per-field non-null rates are included as diagnostics. They are not used alone
as a gate because FotMob may omit a zero-valued event instead of explicitly
returning zero; treating every such null as a missing observation would produce
a false quality claim in the opposite direction.

Every persisted run stores its thresholds, counts, percentages, exact missing
forecast reasons, latency failures, model version/hash, and final gate result in
`data_quality_audit_runs`.

Having this audit code is not proof that the 98% requirement is met. The
criterion requires a recent persisted `COMPLETED` run with `gate_passed=true`
on the production dataset.

## Verified Isolated Run

On 2026-07-15 migration `000005_data_quality_audit_runs` was applied to an
isolated restored database and the audit was persisted for Premier League
2025/26. Run `cmrm2kb410000703zd1k41l08` completed with:

- forecast coverage: `582 / 590 = 98.644%`;
- active-player data coverage: `582 / 590 = 98.644%`;
- finished-match coverage: `380 / 380 = 100%`;
- basic stat-row coverage: `99.967%`;
- promotion-latency coverage: `0%`.

The first four data thresholds pass. The overall gate correctly fails because
the restored historical dataset has no old raw-ingestion timestamps from which
raw→normalized latency can be proved. `0%` here does not mean that normalization
was observed taking longer than six hours; it means that every historical match
lacks the comparable raw timestamp required by the strict denominator.

Raw FotMob payload storage is now enabled for new syncs, so future runs can
measure this interval. The missing historical timestamps must not be recreated
or inferred after the fact. Until a fresh persisted run has 100% comparable
finished matches within six hours, latency and the overall data-quality gate
remain open.

After current-season rollover the isolated 2026/27 player pool contained 629
active players and 619 finite projections (`98.41%`). This confirms that the
forecast-coverage threshold also holds for the current pool, but it is not a
substitute for a passing full audit or a production run.

At verification time `GET /api/health/data-quality` returned `503` with the
persisted metrics above. This is the intended fail-closed monitor behavior.

After deployment the same audit was repeated against the production database.
Run `cmrm6rs0e0000c1rsq7g4mycz` was persisted as `COMPLETED` with forecast
coverage `98.644%`, active-player coverage `98.644%`, finished-match coverage
`100%`, stat-row coverage `99.967%`, and promotion-latency coverage `0%`.
Production `/api/health/data-quality` therefore correctly remains `503`; the
fresh run proves the coverage thresholds and also proves that the latency gate
is still open rather than merely unconfigured.

## Scheduled Control And Alert Signal

Configure every production league-season scope explicitly:

```bash
DATA_QUALITY_AUDIT_ENABLED=true
DATA_QUALITY_AUDIT_SCOPES="47:2025/2026;17:2025"
DATA_QUALITY_AUDIT_TIME="10:00"
DATA_QUALITY_AUDIT_TIMEZONE="Europe/Moscow"
DATA_QUALITY_AUDIT_COVERAGE_PERCENT="98"
DATA_QUALITY_AUDIT_MAXIMUM_LATENCY_HOURS="6"
DATA_QUALITY_AUDIT_MAXIMUM_RUN_AGE_HOURS="26"
```

The Docker/PM2 process runs the same persisted audit service daily. The default
10:00 Moscow time leaves seven hours after the 03:00 ingestion start. Vercel
also calls `GET /api/cron/data-quality` at `07:00 UTC`. The route requires
`Authorization: Bearer <CRON_SECRET>`.

Each scope produces a separate `data_quality_audit_runs` row and structured log
entry. A beta-gate failure returns HTTP `409`; invalid configuration returns
`503`; an execution crash returns `500`. Configure the uptime/logging provider
to alert on every non-2xx response and every
`data-quality:*` warning/error. The repository provides this signal but cannot
prove that an external alert destination is actually configured.

`GET /api/health/data-quality` is a public machine-readable monitor endpoint.
It returns `200` only when every configured scope has a latest `COMPLETED`,
passing audit no older than 26 hours by default. Missing, stale, failed, or
gate-failing runs return `503`. Keep the ordinary `/api/health` endpoint as the
container liveness probe so a data problem alerts operators instead of causing
an automatic restart loop.
