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

The workflow runs checks, SSHes into the host, pulls the requested ref, installs
dependencies, runs Prisma deploy migrations, rebuilds Next.js, verifies
`.next/prerender-manifest.json`, and restarts PM2.

For an existing production database that was created before Prisma migrations,
baseline the initial migration once on the server before enabling non-dry-run
deploys:

```bash
cd /var/www/fantasy-scout
npm run prisma:generate
npx prisma migrate resolve --applied 000001_init
```

New empty databases can use `npm run prisma:migrate:deploy` directly.

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
