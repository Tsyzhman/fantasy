# Fantasy Scout

Next.js fantasy football scouting workspace with three main modes:

- **Machete**: FotMob-backed leagues, fixtures, player stats, fantasy projections and squad planning.
- **Baltika**: Wyscout-style Excel imports, scouting tables and model settings.
- **MiXerr**: shot maps, xG overlays and team/player shot comparisons.

## Stack

- Next.js App Router, React, TypeScript
- Prisma with PostgreSQL
- Tailwind CSS
- Node test runner via `tsx --test`
- ESLint 9 with a local JSX localization warning rule

## Local Development

Requires Node.js `>=20.9.0` (matching Next.js) and npm. If you use nvm,
run `nvm use` to pick the version from `.nvmrc`.

```bash
docker compose up -d postgres
copy .env.example .env
npm install
npm run prisma:migrate:deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Useful pages:

- `/machete/leagues`
- `/machete/players`
- `/machete/squad`
- `/baltika/leagues`
- `/mixerr`
- `/admin/ingestion`

## Checks

Run checks sequentially because Next type generation and builds both touch `.next`:

```bash
npm run check
```

Or run the same steps manually:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## Data Jobs

Common scripts:

```bash
npm run ingestion:status
npm run ingestion:queue-initial-backfill
npm run ingestion:worker
npm run retention:prune-league-seasons -- --dry-run --date=2026-07-01
npm run model:backtest -- --league=47 --season=2024/2025 --expected-matches=380
npm run data:quality -- --league=47 --season=2025/2026
npm run prices:sync-sports-ru -- --league-id=47 --season=2026/2027 --hru=england --dry-run
npm run beta:user-test -- report --since-days=30
```

Current operational docs:

- `docs/LOCAL_DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/DOCKER_PRODUCTION.md`
- `docs/MACHETE_FOTMOB_IMPORT.md`
- `docs/API_ROUTES.md`
- `docs/DATA_MODEL.md`
- `docs/MODEL_BACKTEST.md`
- `docs/DATA_QUALITY.md`
- `docs/SPORTS_RU_FANTASY_SYNC.md`
- `docs/BROWSER_BETA_CHECK.md`
- `docs/BETA_LOAD_TEST.md`
- `docs/BETA_READINESS_AUDIT.md`
- `docs/BETA_USER_TEST_PROTOCOL.md`

Older planning/backlog files are kept as historical references and should not be
treated as the current product architecture unless they explicitly say so.
