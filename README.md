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
npm run prisma:push
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
```

See `docs/LOCAL_DEVELOPMENT.md`, `docs/MACHETE_FOTMOB_IMPORT.md` and `docs/DOCKER_PRODUCTION.md` for operational details.
