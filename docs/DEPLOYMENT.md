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

## Verified Docker production state (2026-07-16)

The currently verified runtime is Docker, not the PM2 workflow described later
in this document:

- active image: `fantasy-scout-web:beta31-20260716T133614Z`;
- image ID:
  `sha256:61d5c13fb55df2723da311fea40bf5a845e72f79798a7fb7518e10ef1565ed4a`;
- source commit: `20bea7b14c824a572c76722491074148343f4451`;
- release directory:
  `/var/www/fantasy-scout-releases/20260716T133614Z-beta31-20bea7b-green-main`;
- active container ID:
  `380c0d541dc7f9648036505c1e0a559818fc527bff28c3013935bc8f811674b4`;
- state after rollout: `running`, `healthy`, restart count `0`;
- stopped immediate rollback container:
  `fantasy-scout-web-beta30-rollback-20260716T134325Z` (beta30 image ID
  `sha256:b92ea7b3b704b19a951223884a6cb0f19a58368dc63929ec96d84b95c824b6e9`);
- external liveness and data-quality health both return HTTP 200;
- applied Prisma state: 7 migrations, including
  `000007_match_promotion_timestamps`; failed/rolled-back migrations: 0;
- PostgreSQL was controllably recreated as container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  with the same image, env, network and
  `fantasy-scout_fantasy-scout-postgres` volume; it is healthy with bounded
  `json-file` logs (`max-size=20m`, `max-file=5`), and the swap preserved
  7 applied migrations plus 10,971 `matches` rows;
- verified pre-000007 backup:
  `/var/backups/fantasy-scout/fantasy_scout_pre_beta26_20260716T101422Z.dump`,
  SHA-256 `0f8442d1d70e64198c240e51671f94972f02ee04aa3a5616bc52d31c28f65aac`.

The checkout at `/var/www/fantasy-scout` contains unrelated uncommitted work.
Do not run `docker compose up --build`, `git reset`, or the PM2 deploy from that
checkout until its changes have been reconciled. The active runtime is pinned to
the release directory and image above.

Production image replacement must use a pre-created stopped candidate with the
same env, network, upload volume, port binding, restart policy, and liveness
healthcheck as the active container. Before stopping production, verify the
exact active image ID, `running|healthy|0`, the exact candidate image ID, and the
candidate's `created` state; syntax-check the swap script and keep an automatic
rollback path. The beta31 swap restored loopback HTTP in 1.862 seconds and its
post-promote browser workflow `29503570431` passed 5 checks with 2 expected
skips; monitor `29503572684` reported 0 critical and 0 warning. The preceding
beta30 swap restored HTTP in 1.772 seconds.

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
- `MACHETE_STORE_RAW_PAYLOADS=true` (non-final payload retention; finalized
  bodies are pruned while timing evidence remains on `matches`)
- `SPORTS_RU_FANTASY_SYNC_SCOPES` (for example
  `47:2026/2027:england`)

The current custom cookie auth implementation does not read `NEXTAUTH_SECRET`
or `NEXTAUTH_URL`.

Monitor `/api/health/data-quality` and `/api/health/fantasy-prices` as separate
non-liveness checks. Both may correctly return `503` while the web process is
healthy; configure alerting instead of using either endpoint for automatic
container restarts. See `docs/DATA_QUALITY.md` and
`docs/SPORTS_RU_FANTASY_SYNC.md` for thresholds.

The repository also contains a scheduled availability/data/access-log monitor,
deduplicated GitHub issue delivery, a Caddy JSON access-log audit, and bounded
container log settings. Installation, verification, privacy rules, and the
explicit temporary price exception are documented in
`docs/PRODUCTION_MONITORING.md`.

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
