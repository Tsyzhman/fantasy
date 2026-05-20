# Docker production runbook

This deployment mode runs the app, ingestion worker and PostgreSQL in one Docker
Compose project. The app containers connect to PostgreSQL through the Compose
service name `postgres`, not through host `localhost`.

## Full reset

This deletes the database, uploaded files, containers and old PM2 processes.

```bash
cd /var/www/fantasy-scout

pm2 delete fantasy-scout || true
pm2 delete fantasy-scout-ingestion || true
pm2 save

docker compose down -v --remove-orphans || true
docker rm -f fantasy-scout-postgres fantasy-scout-web fantasy-scout-ingestion 2>/dev/null || true
docker volume ls -q | grep fantasy | xargs -r docker volume rm

git fetch origin main
git reset --hard origin/main
git clean -fdx
```

## Build and initialize

```bash
docker compose build --no-cache
docker compose up -d postgres
docker compose --profile setup run --rm db-setup
docker compose up -d web ingestion-worker
```

## Verify

```bash
docker compose ps
docker compose logs --tail=80 web
docker compose logs --tail=80 ingestion-worker
docker compose exec web npm run ingestion:status
```

Open `/setup` and create the admin user after the database reset.

## Start initial backfill

Queue the job from inside the web container. The worker container will execute it.

```bash
docker compose exec web npm run ingestion:queue-initial-backfill
docker compose logs -f ingestion-worker
```

The admin page `/admin/ingestion` reads the same database job state and can be
used as a progress monitor.

## Daily updates

The web container queues the scheduled 03:00 Europe/Moscow incremental update.
The `ingestion-worker` container executes queued ingestion jobs.
