# Docker production runbook

This deployment mode runs the app and PostgreSQL in one Docker Compose project.
The app process also runs the in-process ingestion worker loop. App containers
connect to PostgreSQL through the Compose service name `postgres`, not through
host `localhost`.

## Required environment

Create `.env` before running Compose. These values are mandatory:

```bash
POSTGRES_PASSWORD=...
CRON_SECRET=...
```

`CRON_SECRET` protects `/api/cron/*` routes and has no Compose fallback. Use a
long random value. The current custom cookie auth does not use `NEXTAUTH_*`
variables.

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
