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

The current custom cookie auth implementation does not read `NEXTAUTH_SECRET`
or `NEXTAUTH_URL`.

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
