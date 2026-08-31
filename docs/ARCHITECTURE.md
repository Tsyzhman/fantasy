# Architecture

This document describes the current application. Older MVP planning files in
`docs/IMPLEMENTATION_PLAN.md`, `docs/optimization-plan.md`, and parts of
`docs/IMPROVEMENT_BACKLOG.md` are historical references, not the active
architecture.

## Product Modes

Fantasy Scout now has three active product modes:

- Machete: FotMob-backed competition data, fixtures, player stats, Sports.ru
  fantasy prices, projections, and squad planning.
- Baltika: admin-managed Wyscout-style Excel imports, team/player scouting
  tables, manual fixtures, team-stat uploads, and fantasy model settings.
- MiXerr: shot maps, xG overlays, player/team shot views, and comparison
  workflows built on normalized FotMob match data.

The old Wyscout-first MVP still exists as the Baltika import path. It is not the
whole product anymore.

## Runtime Stack

- Next.js App Router with React and TypeScript.
- Prisma Client with PostgreSQL.
- Versioned Prisma migrations as the only schema source of truth.
- Tailwind CSS and server-rendered application pages.
- Node's built-in test runner through `tsx --test`.
- Cron-style API routes protected by `CRON_SECRET`.
- In-process ingestion worker loop when the production app container is running.

## Module Map

```text
src/app/machete
  league setup, league detail, player explorer, models, squad planner, sync jobs

src/app/baltika
  Wyscout-style imported leagues, teams, players, schedule, models

src/app/mixerr
  shot-map explorer and comparison UI

src/app/admin
  admin shell, legacy league/team management, user admin, ingestion controls

src/app/api
  route handlers for imports, ingestion jobs, squads, shot maps, cron, auth

src/core_data
  shared FotMob ingestion, normalized match/team/player/shot repositories

src/machete
  Machete read models, scoring, Sports.ru price mapping, squad planning

src/server/baltika
  Baltika workbook import and fixture/team-stat logic

src/lib
  auth, Prisma client, request parsing, logging, scoring/import helpers

prisma
  datamodel, migrations, seed and recalculation scripts
```

## Data Flows

### Machete FotMob ingestion

```text
Admin or cron queues ingestion
-> ingestion job selects league/season scopes
-> FotMob fixtures and match details are fetched
-> raw payloads are stored only while needed
-> normalized core tables are upserted
-> rosters, player stats, shots, events, and team stats are refreshed
-> Machete read models aggregate current player rows and projections
-> squad planner combines projections with Sports.ru prices and saved squads
```

### Sports.ru fantasy prices

```text
Scheduled or manual Sports.ru GraphQL sync (with workbook fallback)
-> importer normalizes names, teams, positions, prices, and ownership percentage
-> rows are stored in fantasy_player_prices
-> automatic and manual mappings connect prices to FotMob players
-> mapped Sports.ru team, position, and price override a lagging FotMob roster
-> FotMob match history still supplies minutes, form, and event rates
-> worker publishes a CURRENT_XI forecast snapshot at 10:00..23:00 Europe/Moscow
-> saved squad and forecasts render from the DB; remaining complete players arrive in 10% batches
-> squad planner uses the same assignment for forecasts and transactional save validation
```

### Rotating squad player-pool snapshots

`fantasy_player_pool_snapshots` and its player rows hold one CURRENT_XI variant,
with three READY revisions per contest. Full publication, incremental team-row
copy, and pruning share one transaction/advisory lock, so clients never see a
partial generation and a competing publisher cannot prune a new revision.
There is no NO_XI table or process-cache warmup requirement for normal requests.
Worker bootstrap calculates only scopes with no READY revision; an ordinary
restart reuses existing snapshots instead of rebuilding all leagues.

Manual, probable-lineup, and completed-match XI writers enqueue affected teams
in `fantasy_player_pool_refresh_requests` inside the flag transaction. One
unique league/season/team row coalesces repeated edits. Every event has a fresh
token; acknowledgment and failure updates match that token so newer edits are
never lost. The worker polls every two seconds after a one-second debounce,
groups teams by scope, and uses bounded exponential retry delays (5s to 5min).
The web process does not drain this queue.

Snapshot metadata retains a per-team active-roster/XI vector. Incremental
refresh compares the complete vector to catch changes that arrived before
queue pickup, rebuilds only changed teams, and checks for concurrent edits
again before publication. Unaffected player payloads are copied in SQL.
One worker calculation runs at a time to bound peak memory; an hourly trigger
that arrives during incremental work is queued rather than skipped.

The visible squad tab polls the small revision descriptor and downloads a new
revision privately. Only a complete download is merged into player data; user
draft state stays in the session. Nondefault history and personal alternative
formulas retain the dynamic calculation fallback.

### Baltika Excel imports

```text
Admin uploads player or team-stat workbook
-> route checks request and file size
-> workbook parser validates expected sheets and columns
-> SourceFile and import rows are recorded
-> PlayerSnapshot or Baltika team stats are written
-> scoring models calculate published scouting views
```

### MiXerr shot maps

```text
FotMob match data is normalized
-> match_shots stores source_fingerprint and normalized coordinates
-> shot-map API routes apply player/team/match-window filters
-> UI renders attacking, conceded, and comparison layers
```

## Database Policy

Schema changes live in `prisma/schema.prisma` and `prisma/migrations`.
Application startup must not create tables, add columns, create indexes, or run
schema-repair DML. Existing production databases that predate migrations must be
baselined once and then upgraded with `npm run prisma:migrate:deploy`.

`scripts/apply-safe-db-update.ts` is retained only as a compatibility wrapper
around Prisma migrate deploy. New code should not add SQL there.

## Auth And Roles

Roles are `ADMIN` and `USER`.

- Admin users can upload workbooks, trigger ingestion, edit models, manage users,
  and run sync jobs.
- Signed-in users can view published data, save views, maintain watchlists, and
  save Machete squads.
- Cron routes do not rely on cookie auth; they validate
  `Authorization: Bearer <CRON_SECRET>`.
- The current custom cookie/session auth does not use `NEXTAUTH_*`.

## Current Documentation

Use these files for current behavior:

- `README.md`
- `docs/LOCAL_DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/DOCKER_PRODUCTION.md`
- `docs/API_ROUTES.md`
- `docs/DATA_MODEL.md`
- `docs/MACHETE_FOTMOB_IMPORT.md`
- `docs/WYSCOUT_EXCEL_IMPORT.md`

Use planning/backlog documents only for historical context unless they have been
freshly audited against code.
