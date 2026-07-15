# Deployment

Production checkout path:

```bash
cd /var/www/fantasy-scout
```

Use Node.js `>=20.9.0`; `.nvmrc` pins the CI/development major version to
Node 20.

Before deploying, run the full local check or make sure the GitHub Actions check
for the branch is green:

```bash
npm run check
```

## Verified Docker production state (2026-07-15)

The currently verified runtime is Docker, not the PM2 workflow described later
in this document:

- active image: `fantasy-scout-web:beta23-20260715T204137Z`;
- image ID:
  `sha256:311bd2f61fc8cb0f4fa4cc0afc20d2999e9615380c37a291ec023697f618a5b5`;
- release directory:
  `/var/www/fantasy-scout-releases/20260715T204137Z-beta23-pending-reviews`;
- state after rollout: `running`, `healthy`, restart count `0`;
- stopped immediate rollback container:
  `fantasy-scout-web-rollback-pre-beta23-20260715T204137Z` (beta22 image ID
  `sha256:0b26738919f6638772749634f07d3acdf69c70baeb2ee1fb6cd322ef26ba18d5`);
- older stopped rollback:
  `fantasy-scout-web-rollback-pre-beta22-20260715T201038Z` (beta17);
- external liveness: `https://fantasy.tsyzhman.ru/api/health` returns HTTP 200.
- applied Prisma state: 6 migrations, including
  `000006_beta_test_telemetry`; failed/rolled-back migrations: 0;
- verified pre-000006 backup:
  `/var/backups/fantasy-scout/fantasy_scout_pre_beta21_20260715T194036Z.dump`,
  SHA-256 `ecefcd3b325643b1f6d66de7d62b0dc00446b35f8516e3c847d4a5ce0e9aa4ba`.

The checkout at `/var/www/fantasy-scout` contains unrelated uncommitted work.
Do not run `docker compose up --build`, `git reset`, or the PM2 deploy from that
checkout until its changes have been reconciled. The active runtime is pinned to
the release directory and image above.

Production image replacement must use a pre-created stopped candidate with the
same env, network, upload volume, port binding, restart policy, and liveness
healthcheck as the active container. Before stopping production, verify the
exact active image ID, `running|healthy|0`, the exact candidate image ID, and the
candidate's `created` state; syntax-check the swap script and keep an automatic
rollback path. The beta23 swap restored HTTP in 2.011 seconds and completed all
Docker/public/auth checks in 6.575 seconds. The preceding beta22 swap restored
HTTP in 2.311 seconds and completed its checks in 7.032 seconds.

The authenticated beta22 release smoke ran 40 GET requests in batches of five:
0 errors, SSR p75 369 ms, and full-pool API p75 238 ms. The longer beta17
reference ran five concurrent users for 60 seconds: 1,362 requests, 0 errors,
SSR p75 352 ms, and pool p75 85 ms. The container stayed healthy with zero
restarts. These are release smokes, not a substitute for long-running beta
RUM/error-rate monitoring.

Never leave multiple database-backed canaries running. Four obsolete canaries
once exhausted PostgreSQL's 100 connections before beta22 promotion. Production
was not switched and was not affected. After beta23 acceptance and exact canary
cleanup the current state was 8/100 connections. Keep at most one canary and
remove it after acceptance.

An earlier beta14 attempt violated this sequence: a CRLF/quoting error occurred
after the old container had already been stopped and renamed. Production was
unavailable for approximately 30–40 seconds before beta10 was restored. No data
was lost. This incident is why direct `stop` followed by an unvalidated
`docker run` is no longer an accepted rollout method.

## GitHub Actions deploy

The repository includes a manual `Deploy Production` workflow. It is dry-run by
default and deploys only when `dry_run` is set to `false`.

Required GitHub environment secrets for `production`:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH` (for example `/var/www/fantasy-scout`)
- `DEPLOY_PM2_PROCESS` (for example `fantasy-scout`)
- `DEPLOY_PORT` (optional; defaults to `22`)

Required runtime environment variables on the production host:

- `DATABASE_URL`
- `CRON_SECRET`
- `DATA_QUALITY_AUDIT_SCOPES` (for example `47:2025/2026`)
- `MACHETE_STORE_RAW_PAYLOADS=true` (required to prove the six-hour promotion
  latency on future imports)
- `SPORTS_RU_FANTASY_SYNC_SCOPES` (for example
  `47:2026/2027:england`)

The current custom cookie auth implementation does not read `NEXTAUTH_SECRET`
or `NEXTAUTH_URL`.

Monitor `/api/health/data-quality` and `/api/health/fantasy-prices` as separate
non-liveness checks. Both may correctly return `503` while the web process is
healthy; configure alerting instead of using either endpoint for automatic
container restarts. See `docs/DATA_QUALITY.md` and
`docs/SPORTS_RU_FANTASY_SYNC.md` for thresholds.

The workflow runs checks, SSHes into the host, pulls the requested ref, installs
dependencies, runs Prisma deploy migrations, rebuilds Next.js, verifies
`.next/prerender-manifest.json`, and restarts PM2.

For an existing production database that was created before Prisma migrations,
baseline the initial migration once on the server before enabling non-dry-run
deploys:

```bash
cd /var/www/fantasy-scout
pg_dump "$DATABASE_URL" > fantasy_scout_before_migrations.sql
npm run prisma:generate
npx prisma migrate resolve --applied 000001_init
npm run prisma:migrate:deploy
```

Migration `000002_runtime_schema_cleanup` is the source of truth for schema
changes that older releases performed at application startup or through
`db:safe-update`. It also runs the historical data repair for current
`MachetePlayerSnapshot` rows and `match_shots.source_fingerprint`. The Machete
repair deletes duplicate current snapshots and keeps the newest row by
`createdAt`, then `id`, so the backup is not optional for existing production
data.

`db:safe-update` is now only a compatibility wrapper around
`prisma migrate deploy`. New empty databases can use
`npm run prisma:migrate:deploy` directly.

To check Prisma migration drift locally, create an empty shadow database and run:

```bash
SHADOW_DATABASE_URL="postgresql://user:pass@localhost:5432/fantasy_scout_shadow?schema=public" npm run prisma:migrate:diff
```

## Dependency audit policy

Production dependency advisories at `moderate` or higher fail CI through
`npm run audit:prod`. The `exceljs@4.4.0` dependency still declares
`uuid@^8.3.0`, while npm's forced fix downgrades ExcelJS to an older breaking
major. Keep ExcelJS on `4.4.0` and use the npm override for `uuid@11.1.1`
instead; workbook import and export tests cover the project paths that use
ExcelJS.

## Manual PM2 deploy

Update production from `main`:

```bash
cd /var/www/fantasy-scout
git checkout main
git pull origin main
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
pm2 restart fantasy-scout --update-env
```

If the PM2 process has a different name, check it with:

```bash
pm2 list
```

If Next.js fails with a missing `.next/prerender-manifest.json`, rebuild in the
same directory used by PM2:

```bash
cd /var/www/fantasy-scout
npm run prisma:generate
npm run build
test -f .next/prerender-manifest.json && echo "build ok"
pm2 restart fantasy-scout --update-env
```
