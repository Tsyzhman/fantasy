# Architecture

This document describes the current application. Older MVP planning files in
`docs/archive/planning/IMPLEMENTATION_PLAN.md`, `docs/archive/planning/optimization-plan.md`, and parts of
`docs/archive/planning/IMPROVEMENT_BACKLOG.md` are historical references, not the active
architecture.

## Product modules

| Area | Entry | Implementation |
|---|---|---|
| Machete football | `/machete/leagues`, `/machete/players`, `/machete/squad`, `/machete/leagues/:leagueId/strength` | `src/app/machete`, `src/machete` |
| MiXerr | `/mixerr`, `/mixerr/passing-networks` | `src/app/mixerr`, `src/mixer` |
| KHL beta | `/machete/khl/squad`, `/machete/khl/players`, `/machete/khl/calendar` | `src/khl`, `src/server/khl` |
| Fantasy Arena | `/betting` | `src/app/betting`, `src/betting` |
| Franchises | `/franchises` | `src/franchises`, `src/server/franchises`, `scripts/franchise-analytics` |
| Telegram and deadline reports | Profile settings | `src/server/telegram`, `src/server/deadline-reports` |
| Sports.ru squad transfer | Browser extension | `extensions/sports-squad-transfer`, `src/app/api/browser-extension` |

Machete can read historical Wyscout metrics from published records and use the
stored Wyscout scoring model as a fallback. The technical map names the
remaining modules and their contract owners. [Technical map](../../specs/common/structure.md)

## Runtime Stack

- Next.js App Router with React and TypeScript.
- Prisma Client with PostgreSQL.
- Versioned Prisma migrations as the only schema source of truth.
- Tailwind CSS and server-rendered application pages.
- Node's built-in test runner through `tsx --test`.
- Cron-style API routes protected by `CRON_SECRET`.
- Production Caddy routes to the serving web container. A dedicated worker
  runs background ingestion and publishes player-pool revisions. Franchise
  collection and calculation run in a bounded one-off container. [Deployment](../operations/DEPLOYMENT.md)

## Module Map

```text
src/app/machete
  league setup, league detail, player explorer, models, squad planner, sync jobs

src/app/mixerr
  shot-map explorer, comparison UI, and StatsBomb passing-network view

src/app/admin
  admin shell, user management, ingestion controls, global Machete model settings

src/app/api
  route handlers for imports, ingestion jobs, squads, shot maps, cron, auth

src/core_data
  shared FotMob ingestion, normalized match/team/player/shot repositories

src/machete
  Machete read models, scoring, Sports.ru price mapping, squad planning

src/lib
  auth, Prisma client, request parsing, logging, scoring/import helpers

prisma
  datamodel, migrations, and seed script
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

### Football contest data

```text
Scheduled or manual Sports.ru GraphQL sync (with workbook fallback)
-> importer normalizes names, teams, positions, prices, and ownership percentage
-> rows are stored in fantasy_player_prices
-> automatic and manual mappings connect prices to FotMob players
-> mapped Sports.ru team, position, and price override a lagging FotMob roster
-> FotMob match history still supplies minutes, form, and event rates
-> worker publishes a versioned CURRENT_XI forecast snapshot
-> saved squad and forecasts render from the DB; remaining complete players arrive in 10% batches
-> squad planner uses the same assignment for forecasts and transactional save validation
```

FPL and Sports.ru can share a FotMob league while retaining separate contests,
prices, rosters, rules, and official scores. FPL validates active membership
independently of the reported position. Sports.ru club limits and transfer
rules are tied to the target contest and provider round.
[Squad contract](../../specs/modules/machete/FEAT-001-global-ranking-strategy.md) ·
[FPL roster verification](../../specs/work/archive/2026/WI-044-fpl-active-roster-import.md)

### Sports.ru Squad forecasts

Squad shows FO and Alt with the corresponding opponent-adjusted comparisons
`FO Opp.` and `Alt Opp.`. It sums fixture forecasts before rounding a round
total to hundredths. The FIT, MIX, GAS, REF, and TIK comparison columns show
the calibrated chance of scoring at least five points by default. The display
also offers expected points. Sorting, filters, and the player-table XLSX use
the active metric and selected columns.
[Forecast contract](../../specs/modules/machete/FEAT-001-global-ranking-strategy.md) ·
[Chronological evaluation](../research/SQUAD_FIVE_PLUS_2026-11-13.md)

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

The SorareInside worker chooses the nearest future match across competitions
for each club. A complete last-played XI can fill a missing or incomplete
forecast once all 11 players are matched to the active pool. If neither source
can resolve all 11, the affected scope keeps its prior flags.
[Starting XI integration](../integrations/SORAREINSIDE_STARTERS.md)

### League strength

Machete's league-season strength view fits a Massey ranking on eligible played
matches. It reports raw xG with its coverage and schedule difficulty from
opponents already played. A team without an eligible result has no fitted
rating.
[Massey contract](../../specs/modules/machete/FEAT-015-league-strength.md)

### MiXerr shot maps

```text
FotMob match data is normalized
-> match_shots stores source_fingerprint and normalized coordinates
-> shot-map API routes apply player/team/match-window filters
-> UI renders attacking, conceded, and comparison layers
```

### MiXerr passing networks

The browser reads a completed StatsBomb event file and builds one graph per
starting XI from successful passes. Each team's cutoff is its first
substitution or a starter's dismissal, whichever comes first. The browser
keeps the two derived graphs in page state.
[Passing networks contract](../../specs/modules/mixerr/FEAT-014-passing-networks.md)

### Franchises and Telegram

Franchises imports participant and source-duel records, calculates a prepared
analytics revision, and serves the latest published snapshot. One XI per
football round enters the franchise population if it was active in any duel.
Personal histories and per-duel freezes are retained. The report cache keys
by revision and normalized date and league filters.
[Franchise analytics contract](../../specs/modules/franchises/FEAT-005-franchise-analytics.md)

Telegram linking starts in the signed-in site's profile and completes after a
bot interaction and site confirmation. The deadline pipeline uses the
provider's round identity, the latest available published squad or a saved
Scout squad, prepared data snapshots, and a durable inbox and outbox. The worker
rechecks consent before sending. [Linking](../../specs/modules/telegram/FEAT-007-deadline-assistant.md) ·
[Delivery and freshness](../../specs/modules/telegram/INFRA-005-deadline-pipeline.md)

## Database Policy

Schema changes live in `prisma/schema.prisma` and `prisma/migrations`.
Application startup must not create tables, add columns, create indexes, or run
schema-repair DML. Existing production databases that predate migrations must be
baselined once and then upgraded with `npm run prisma:migrate:deploy`.

`scripts/apply-safe-db-update.ts` is retained only as a compatibility wrapper
around Prisma migrate deploy. New code should not add SQL there.

## Auth And Roles

Roles are `ADMIN` and `USER`.

- Admin users can import fantasy prices, trigger ingestion, edit models, manage users,
  and run sync jobs.
- Signed-in users can view published data, save views, maintain watchlists, and
  save Machete squads.
- Cron routes do not rely on cookie auth; they validate
  `Authorization: Bearer <CRON_SECRET>`.
- The current custom cookie/session auth does not use `NEXTAUTH_*`.

## Current Documentation

Use these files for current behavior:

- `README.md`
- `docs/development/LOCAL_DEVELOPMENT.md`
- `docs/operations/DEPLOYMENT.md`
- `docs/operations/DOCKER_PRODUCTION.md`
- `docs/reference/API_ROUTES.md`
- `docs/reference/DATA_MODEL.md`
- `docs/integrations/MACHETE_FOTMOB_IMPORT.md`

Use planning/backlog documents only for historical context unless they have been
freshly audited against code.
