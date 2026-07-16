# Deployment

Legacy checkout path (currently dirty; not the active build source):

```bash
cd /var/www/fantasy-scout
```

Production images must be built from a clean immutable directory under
`/var/www/fantasy-scout-releases/`. Do not pull, reset, build, or deploy from the
legacy checkout until its unrelated changes have been reconciled.

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

- active image: `fantasy-scout-web:beta33-20260716T162012Z`;
- image ID:
  `sha256:1632280efe40aac35139e56840fbc5d9be660471303839c0cc1cac63f6deeff4`;
- source commit: `c4019cae678638390a0bdc749ab1c5c6f8be7bec`;
- release directory:
  `/var/www/fantasy-scout-releases/20260716T162012Z-beta33-c4019ca-green-main`;
- active container ID:
  `43937a69e4348431389473af4daa2600e2232d40e9d0f8d11fa0f5345d75a481`;
- state after rollout: `running`, `healthy`, restart count `0`;
- stopped immediate rollback container is bounded-log beta32:
  `fantasy-scout-web-beta32-rollback-pre-beta33-20260716T162012Z`
  (container ID
  `6e25d4c55bf166e23aff2b99c65e4bb63b2b66fa28ca203c8580a27b22343958`);
- retained historical pre-log-fix beta32 rollback:
  `fantasy-scout-web-beta32-unbounded-log-rollback-20260716T144424Z`
  (container ID
  `2eb8efb7a82284f68f2701033c542fb9f2b1da5efc18c0141c38835226dcaf7c`);
- older stopped beta31 rollback:
  `fantasy-scout-web-beta31-rollback-20260716T143434Z` (image ID
  `sha256:61d5c13fb55df2723da311fea40bf5a845e72f79798a7fb7518e10ef1565ed4a`);
- external liveness and data-quality health both return HTTP 200;
- applied Prisma state: 8 migrations, including
  `000008_beta_test_moderated_environment`; failed/rolled-back migrations: 0;
- PostgreSQL was controllably recreated as container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  with the same image, env, network and
  `fantasy-scout_fantasy-scout-postgres` volume; it is healthy with bounded
  `json-file` logs (`max-size=20m`, `max-file=5`), and the swap preserved
  8 applied migrations plus 10,971 `matches` rows;
- verified pre-beta32 backup (custom format, checked with `pg_restore --list`):
  `/var/backups/fantasy-scout/fantasy_scout_pre_beta32_20260716T141021Z.dump`,
  50,259,500 bytes, SHA-256
  `38431add328d9e5920dab81d59248a8a7116c2660f540fdcf0e600e85632f4d5`.

The checkout at `/var/www/fantasy-scout` contains unrelated uncommitted work.
Do not run `docker compose up --build`, `git reset`, or the PM2 deploy from that
checkout until its changes have been reconciled. The active runtime is pinned to
the immutable release directory and image above.

Production image replacement must use a pre-created stopped candidate with the
same env, network, upload volume, port binding, restart policy, and liveness
healthcheck as the active container. Before stopping production, verify the
exact active image ID, `running|healthy|0`, the exact candidate image ID, and the
candidate's `created` state; syntax-check the swap script and keep an automatic
rollback path. Also compare `.HostConfig.LogConfig`: copying env/network/volume
does not copy log rotation. The first beta32 candidate inherited an empty
`LogConfig.Config`; a second guarded swap recreated the same image with explicit
`json-file`, `max-size=20m`, `max-file=5`. That incident remains the reason for
the mandatory exact log-config guard.

Beta33 used clean archive SHA-256
`c75ac11c89273d321340b55af1985146c029c36f126790738a15faf0a4fe994c`, one
loopback canary with schedulers disabled and a read-only upload volume, then an
exact stopped candidate. Canary ID
`c97c8e5bcceae4f3983657b565b6bae04a7bf945c0131d6c1e0fb7b46860abf9` was
removed before the swap; candidate
`fantasy-scout-web-beta33-candidate-20260716T162012Z` became active container
`43937a69e4348431389473af4daa2600e2232d40e9d0f8d11fa0f5345d75a481`, so the
candidate-name is absent after promotion. Guarded swap restored loopback HTTP in 2.242 seconds,
left DB signature `8|0|10971` unchanged, and retained beta32 as the immediate
rollback. Browser workflow `29517734343` passed 5 checks with 2 expected skips;
evidence is artifact `8383413207`. Monitor `29517734277` reported 0 critical,
0 warning, 227 requests, 0 responses 5xx, p75 37.322 ms and p95 218.53 ms.
Final app log inspection found 0 critical-pattern lines in the last 20 minutes.
These are release checks, not long-running real-user RUM/error-rate evidence.

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

## Legacy manual PM2 deploy (disabled while the checkout is dirty)

Do not run this section in the current server state. It is retained only for a
future PM2 runtime after `/var/www/fantasy-scout` has been reconciled and verified
clean. The current production runtime must use the immutable Docker release
procedure documented above.

After that reconciliation only, update a PM2 runtime from `main`:

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
