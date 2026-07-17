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

## Verified Docker production state (2026-07-17)

The currently verified runtime is Docker, not the PM2 workflow described later
in this document:

- active image: `fantasy-scout-web:beta39-20260717T114447Z`;
- image ID:
  `sha256:7fb33bf67c78e400bb66b66bc08bc2e4be1f59f97242143b0a7d9d0c77f3b038`;
- source commit: `41e1515bedc54f96e46bf62d3971c118a41e9639`;
- release directory:
  `/var/www/fantasy-scout-releases/20260717T114447Z-beta39-41e1515-green-main`;
- active container ID:
  `b423653045f0b31f831519669832a8e0bee8e668275d4ec2defdc976a51dcfb8`;
- state after rollout: `running`, `healthy`, restart count `0`;
- stopped immediate rollback container is exact bounded-log beta38:
  `fantasy-scout-web-beta38-rollback-pre-beta39-20260717T114447Z`
  (container ID
  `815ae6085d78e7b4887b4c012a27f21bc57de31a8e639541b0e4fcfacd5064c8`,
  state `exited`);
- preserved older rollback is exact bounded-log beta33:
  `fantasy-scout-web-beta33-rollback-pre-beta36-20260717T070721Z`
  (container ID
  `c2cea7a73bcc53df5e352cce6c9baee4bc51b02f21f7c65d5c804083851b21dd`,
  state `created`);
- external liveness and data-quality health both return HTTP 200;
- applied Prisma state: 10 migrations, including the expand-only
  `000009_beta_test_submission` and the bounded-lock
  `000010_beta_test_submission_contract`; failed/rolled-back migrations: 0;
- PostgreSQL was controllably recreated as container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  with the same image, env, network and
  `fantasy-scout_fantasy-scout-postgres` volume; it is healthy with bounded
  `json-file` logs (`max-size=20m`, `max-file=5`), and the swap preserved
  10 applied migrations plus 10,972 `matches` rows;
- `/var/www/fantasy-scout-current` points to the beta39 immutable release;
- verified pre-contract backup (custom format, checked with
  `pg_restore --list`):
  `/var/backups/fantasy-scout/pre-beta40-contract-20260717T120353Z.dump`,
  SHA-256
  `9cf65938bb68000a79c5d5c74dd31ab856bfe7215f27bf0eed63a2e8687b3502`;
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

Container identity checks must use `docker container inspect`; image checks must
use `docker image inspect`. Generic `docker inspect` is forbidden in a swap
state machine because, while the active container name is temporarily free,
Docker can resolve the same string as an image repository and return an image ID.
Compare the full normalized `HostConfig`, healthcheck, entrypoint/cmd/user/
working directory, mounts, networks/aliases and env before stopping active. The
current symlink must be an exact symlink target and must be replaced atomically
through a sibling link plus `mv -Tf`.

The following beta38 rollout notes are historical release evidence.

Beta38 used archive SHA-256
`adcdfedda301307200e10cc00e08abc4884e3dfd46c0e38510cea2e10363dd52`.
The exact canary passed health, structured logs and coarse portrait/landscape UI
checks, then was removed with port 3418 free. CI `29570144902` was green.

The first beta38 promotion attempt stopped and renamed beta36, then the generic
inspect ambiguity above made the guard see image ID
`sha256:cd96403927bcf6fafc2766c6040c2b613285b3604cfd873e18efa1145f31fe7f`
instead of an empty container slot. Rollback refused the unknown identity; exact
beta36 was manually restored. This caused a temporary production interruption;
its duration was not instrumented. No candidate process had started and the DB
was not changed by that attempt. After typed lookup fixes and another P0–P2
audit, the successful swap restored HTTP in 1.835 seconds.

The successful promotion compared a 13-table critical-data digest before/after,
not a whole-database byte hash. App, PostgreSQL and Caddy critical logs were 0;
Caddy 5xx during the successful swap were 0. Production Browser Smoke
`29573697960` passed 5 checks with 2 expected skips and uploaded artifact
`8404162521`; exact QA cleanup returned users/squads/players/beta rows to
`4|2|30|1|20`. Production Monitor `29573699815` had 0 critical failures but one
warning: access audit `insufficient_data` with 14 eligible requests and 2×5xx
before beta38. The workflow is green by design for warnings; do not call this a
clean monitor pass.

The following beta36 paragraph is historical release evidence.

Beta36 used clean archive SHA-256
`1661d4096e0749a71835309029b6187cd60d30caac1a8bff0a209ac0cb5900df`, one
loopback canary with schedulers disabled and a read-only upload volume, then an
exact stopped candidate. Canary ID
`101881b3e44abf0dc3d5d521a43e9afe2cc3f1a57b00613fdfa80b1288040d69`
passed health, report-auth, runtime, log and full Edge journey checks, then was
removed before the swap. The journey covered real player search, 15/15
auto-pick, a real transfer recommendation, save, server `squadId`, reload and
restore. Guarded swap restored loopback HTTP in 2.153 seconds, left DB signature
`8|0|10972` unchanged, and retained beta33 as the immediate rollback.

A later security audit found a stale rendered compose-config in `/tmp` with
mode 0664 and current production DB/cron credentials. The exact file was
removed. The PostgreSQL role password, web `DATABASE_URL`, and `CRON_SECRET`
were rotated without changing the beta36 image/revision or database contents.
HTTP recovered in 6.742 seconds. Old active/rollback containers containing the
previous values were removed; `/var/www/fantasy-scout/.env` remains mode 0600.
The active and beta33 rollback container IDs above are the post-rotation IDs.

Post-rotation browser workflow `29566426370` passed 5 checks with 2 expected
skips; sanitized evidence is artifact `8401309300`. Monitor `29566962197`
reported 0 critical and 0 warnings. Its fresh snapshot excluded 399 tagged
synthetic requests and included 234 eligible requests, 0 responses 5xx,
p75/p95 22.767/50.482 ms and a 51.834-minute span. These are release checks, not
long-running real-user RUM/error-rate evidence.

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
