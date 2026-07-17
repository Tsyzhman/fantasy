# Docker production runbook

This deployment mode runs the app and PostgreSQL in one Docker Compose project.
The app process also runs the in-process ingestion worker loop. App containers
connect to PostgreSQL through the Compose service name `postgres`, not through
host `localhost`.

Compose-created PostgreSQL and web containers use bounded `json-file` logging:
five files of 20 MiB. Existing containers keep their original log driver
options until a controlled recreation. Immutable manual candidates must use the
same `--log-opt max-size=20m --log-opt max-file=5` contract. Caddy access logging,
the 15-minute aggregate audit, and GitHub issue alert delivery are described in
`docs/PRODUCTION_MONITORING.md`.

## Current verified release

As of 2026-07-17, production runs
`fantasy-scout-web:beta36-20260717T070721Z` from
`/var/www/fantasy-scout-releases/20260717T070721Z-beta36-c0d969b-green-main`. Its exact
image ID is
`sha256:6590f96619d8b85ac9215d5a32a8e0b0e4046dea126f670dac108d7fed5141ca`
and source commit is `c0d969bec6f558de61f2dbdd277528dc53a8d7e1`.
Active container ID
`16398e4b3103a2408b67414ced74e2df28d2ce72bb3f64d2b375afc5b90c6f94`
is healthy with zero restarts and explicit `json-file` rotation
(`max-size=20m`, `max-file=5`). The stopped immediate rollback is exact
bounded-log beta33
`fantasy-scout-web-beta33-rollback-pre-beta36-20260717T070721Z`, container ID
`c2cea7a73bcc53df5e352cce6c9baee4bc51b02f21f7c65d5c804083851b21dd`
in `created` state.
The older beta32 image before its log-config correction remains retained as
`fantasy-scout-web-beta32-unbounded-log-rollback-20260716T144424Z`, container ID
`2eb8efb7a82284f68f2701033c542fb9f2b1da5efc18c0141c38835226dcaf7c`.
The older beta31 rollback `fantasy-scout-web-beta31-rollback-20260716T143434Z`
is also retained. Both liveness and data-quality health return HTTP 200.
Production has 8/8 applied Prisma migrations, 0 failed/rolled-back migrations,
and a passing persisted 380-match data-quality audit.
PostgreSQL container ID
`325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
uses the same `postgres:16-alpine` image and
`fantasy-scout_fantasy-scout-postgres` volume as before, is healthy, and now has
bounded `json-file` logging (`max-size=20m`, `max-file=5`). Its controlled
recreation preserved 8 applied migrations and 10,972 `matches` rows; the web
container and both public health endpoints recovered successfully before the
old container was removed. The
`/var/www/fantasy-scout-current` symlink points to the immutable beta36
release.

The verified pre-beta32 custom-format backup is
`/var/backups/fantasy-scout/fantasy_scout_pre_beta32_20260716T141021Z.dump`,
50,259,500 bytes, SHA-256
`38431add328d9e5920dab81d59248a8a7116c2660f540fdcf0e600e85632f4d5`.

The normal release sequence is:

1. copy the previous immutable release to a new unique release directory and
   replace only the verified files;
2. build a new unique image tag and record its exact image ID;
3. start it on a loopback-only canary port with schedulers disabled;
4. run HTTP, authenticated desktop/mobile, console, and performance checks;
5. create the production candidate in the stopped `created` state with the
   active env, network, port, upload volume, restart policy, healthcheck, and
   explicit `--log-driver json-file --log-opt max-size=20m --log-opt max-file=5`;
6. syntax-check the swap script and require exact active/candidate preconditions;
7. stop/rename the active container, rename/start the candidate, poll both HTTP
   and Docker health, and automatically restore the previous container on any
   failure.

The first beta32 swap restored loopback HTTP in 2.351 seconds. Inspection then
showed that the manual candidate had inherited `json-file` with an empty config,
so the same image was recreated and promoted with explicit rotation; that
log-fix swap restored HTTP in 1.909 seconds. This remains historical incident
evidence and the reason explicit log options are mandatory.

Beta36 used archive SHA-256
`1661d4096e0749a71835309029b6187cd60d30caac1a8bff0a209ac0cb5900df`. Canary
ID `101881b3e44abf0dc3d5d521a43e9afe2cc3f1a57b00613fdfa80b1288040d69`
used the exact image/revision, port `127.0.0.1:3416`, read-only uploads and
disabled schedulers. It passed health, report-auth, runtime/log checks and the
full Edge journey from real-player search through 15/15 auto-pick, a real
transfer recommendation, save, server `squadId`, reload and restore. Exact QA
cleanup completed and the canary was removed. The stopped candidate had exact
env/network/port/RW upload volume/restart policy/healthcheck and bounded logs.
Guarded swap restored HTTP in 2.153 seconds. DB signature stayed
`8|0|10972`; beta33 became the immediate rollback.

A later security audit found current DB/cron credentials in a stale rendered
`/tmp` compose-config with mode 0664. The exact file was removed. The
PostgreSQL role password, web `DATABASE_URL`, and `CRON_SECRET` were rotated
with an exact-guarded swap; HTTP recovered in 6.742 seconds and DB signature
remained `8|0|10972`. The old active/rollback containers containing previous
values were removed. The active/rollback IDs at the top of this section are the
post-rotation IDs; the code image and OCI revision did not change.

Post-rotation browser run `29566426370` passed 5 checks with 2 expected skips,
sanitized artifact `8401309300`; monitor `29566962197` reported 0 critical
and 0 warnings. Its fresh snapshot excluded 399 tagged synthetic requests,
included 234 eligible requests, 0 responses 5xx, p75/p95 22.767/50.482 ms and a
51.834-minute observed span. Treat this as release evidence only; long-running
RUM and real-user server error rate remain open.
During the first beta14 attempt, a
CRLF/quoting defect occurred after production had been stopped, causing
approximately 30–40 seconds of downtime before beta10 was restored. There was
no data loss. Never use a direct unvalidated `stop` + `docker run` sequence for
production.

The final beta22 load smoke used 40 authenticated GET requests in batches of
five: 0 errors, SSR p75 369 ms, full-pool API p75 238 ms, and zero container
restarts. The longer beta17 reference remains 1,362 requests, 0 errors, SSR/pool
p75 352/85 ms. Treat both as release evidence only; collect long-running RUM and
server error rate during the real beta.

Keep at most one database-backed canary. Four obsolete beta18–beta21 canaries
exhausted PostgreSQL's 100 connections before beta22 promotion and caused a
canary-only HTTP 500. Production was not switched. After removing only those
exact containers and completing acceptance, the beta23 final database state was
8/100 connections and its canary was removed.

The existing `/var/www/fantasy-scout` checkout has unrelated uncommitted work.
Do not rebuild production from it until those changes are reconciled; doing so
can silently redeploy older code.

## Required environment

Create `.env` before running Compose. These values are mandatory:

```bash
POSTGRES_PASSWORD=...
CRON_SECRET=...
DATA_QUALITY_AUDIT_SCOPES="47:2025/2026"
```

`CRON_SECRET` protects `/api/cron/*` routes and has no Compose fallback. Use a
long random value. The current custom cookie auth does not use `NEXTAUTH_*`
variables.

`DATA_QUALITY_AUDIT_SCOPES` is mandatory for beta operations. Use explicit
`<league id>:<season>` entries separated by commas or semicolons.

## Full reset

This deletes the database, uploaded files, containers and old PM2 processes.

```bash
cd /var/www/fantasy-scout

pm2 delete fantasy-scout || true
pm2 save

docker compose down -v --remove-orphans || true
docker rm -f fantasy-scout-postgres fantasy-scout-web 2>/dev/null || true
docker volume ls -q | grep fantasy | xargs -r docker volume rm

git fetch origin main
git reset --hard origin/main
git clean -fdx
```

## Build and initialize

For a clean empty database, initialize with deployed Prisma migrations:

```bash
docker compose build --no-cache
docker compose up -d postgres
docker compose --profile setup run --rm db-setup
docker compose up -d web
```

For an existing production database created before migrations, take a backup
first and baseline the initial migration once before running setup:

```bash
docker compose exec postgres pg_dump -U fantasy_app -d fantasy_scout > fantasy_scout_backup.sql
docker compose --profile setup run --rm db-setup npx prisma migrate resolve --applied 000001_init
docker compose --profile setup run --rm db-setup npm run prisma:migrate:deploy
```

The deploy step applies `000002_runtime_schema_cleanup`, which replaces the old
runtime schema mutation and `db:safe-update` SQL path. It also performs the
legacy repair for `MachetePlayerSnapshot` and `match_shots.source_fingerprint`;
duplicate current Machete snapshots are deleted after keeping the newest row by
`createdAt`, then `id`. Do not run it on existing production data without the
backup above.

## Verify

```bash
docker compose ps
docker compose logs --tail=80 web
docker compose --profile setup run --rm db-setup npm run ingestion:status
```

Open `/setup` and create the admin user after the database reset.

## Start initial backfill

Queue the job with the setup image or from `/admin/ingestion`. The web
container's in-process worker loop will execute it.

```bash
docker compose --profile setup run --rm db-setup npm run ingestion:queue-initial-backfill
docker compose logs -f web
```

The admin page `/admin/ingestion` reads the same database job state and can be
used as a progress monitor.

## Daily updates

The web container queues the scheduled 03:00 Europe/Moscow incremental update
and executes queued ingestion jobs in its in-process worker loop.

## Raw payload cleanup

Finalized FotMob match payloads are not retained after normalized rows are
written. Audit storage first:

```bash
docker compose --profile setup run --rm db-setup npm run payloads:audit
```

To reclaim disk from an older deployment, run:

```bash
docker compose --profile setup run --rm db-setup npm run payloads:prune-finalized -- --older-than-days=7 --yes
docker compose --profile setup run --rm db-setup npm run payloads:prune-machete -- --older-than-days=30 --yes
```

Both prune commands print a dry-run count when `--yes` is omitted.

## League-season retention

The web container also runs shared FotMob season retention at 03:30
Europe/Moscow on January 1 and July 1. January prunes spring-autumn seasons
outside the latest two-season window; July does the same for autumn-spring
seasons. Preview manually with:

```bash
docker compose --profile setup run --rm db-setup npm run retention:prune-league-seasons -- --dry-run --date=2026-07-01
```

## Daily data-quality gate

The web container persists forecast/data coverage audits at 10:00
Europe/Moscow. Inspect the latest result and logs with:

```bash
docker compose --profile setup run --rm db-setup npm run data:quality -- --league=47 --season=2025/2026
docker compose logs --since=24h web
```

A failed gate is emitted as a structured warning. Docker Compose does not send
alerts by itself; the production log/uptime provider must alert on
`data-quality:*` warnings/errors and non-2xx responses from
`/api/cron/data-quality`.

Configure a separate uptime check for `/api/health/data-quality`. It returns
`503` when the latest audit for any configured scope is missing, failing, or
older than 26 hours. Do not replace the container `/api/health` liveness probe
with this endpoint: stale football data should page an operator, not restart a
healthy process repeatedly.

## Sports.ru current-price control

Configure `SPORTS_RU_FANTASY_SYNC_SCOPES`, then monitor
`/api/health/fantasy-prices`. The scheduler attempts a validated GraphQL sync
after startup and every six hours. The health endpoint returns `503` when the
snapshot is absent, older than seven hours, has fewer than 100 players, or has
less than 98% player mapping. Import failures preserve the last valid prices.
As with data quality, keep `/api/health` as container liveness and alert on the
separate price endpoint and `sports-ru-fantasy:*` warning/error logs.
