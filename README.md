# Fantasy Scout

A full-stack sports analytics workspace for fantasy squad decisions. It combines
provider ingestion, player matching, projections, budget and roster constraints,
spreadsheet imports, and shot-map analysis in one application.

## What the application does

| Area | Main workflow |
|---|---|
| **Machete** | Explore FotMob leagues, fixtures and player statistics; combine fantasy prices and projections; build and save legal squads. |
| **Baltika** | Import Wyscout-style Excel workbooks, manage scouting tables and schedules, and configure models. |
| **MiXerr** | Inspect player and team shot maps, xG overlays, and comparison views on normalized match data. |
| **KHL beta** | Use an isolated hockey player pool, fantasy rules, statistics imports, and squad planning. Coverage and readiness are documented separately. |
| **Fantasy Arena** | Place virtual-coin bets and compare algorithmic strategies using stored odds, an account ledger, and settlement rules. |

The application has session-based authentication, user/admin roles, saved views,
watchlists, and administrative tools for imports, mappings, and ingestion jobs.
Most application labels are currently Russian; the repository documentation is
English.

## Start here

- [Documentation index](docs/README.md) — all guides, references, research, and historical plans.
- [Product brief](docs/product/PRODUCT_BRIEF.md) — audience, workflows, and scope.
- [Architecture](docs/reference/ARCHITECTURE.md) — modules, data flows, and runtime decisions.
- [Data model](docs/reference/DATA_MODEL.md) and [API routes](docs/reference/API_ROUTES.md) — storage and HTTP contracts.
- [Specification map](specs/SPEC-MAP.md) — canonical feature and infrastructure contracts.

For a code review, start with [provider normalization](src/core_data),
[fantasy domain logic](src/machete), [server workflows](src/server),
[route handlers](src/app/api), and [database migrations](prisma/migrations).

## Engineering approach

Provider payloads are normalized into shared PostgreSQL tables. Fantasy prices
are matched to provider identities before projections and squad constraints are
applied. Squad read models use database snapshots and bounded refresh work;
ingestion jobs support incremental updates and raw-payload retention controls.

The repository keeps versioned schema migrations, domain tests, browser checks,
operational runbooks, and specifications linked from responsible code with
`@spec` markers. See the [architecture](docs/reference/ARCHITECTURE.md),
[data-quality guide](docs/testing/DATA_QUALITY.md), and
[backtesting guide](docs/testing/MODEL_BACKTEST.md) for details and evidence.

## Stack

- Next.js App Router, React, and TypeScript.
- Prisma with PostgreSQL.
- Tailwind CSS.
- Node's test runner through `tsx --test`, Playwright, and ESLint.
- Docker Compose for local PostgreSQL and production containers.

## Local development

Requirements: Node.js `>=20.9.0`, npm, and Docker Compose. The pinned Node version
is in [.nvmrc](.nvmrc); use `nvm use` if available.

Copy [.env.example](.env.example) to `.env` and configure the required values.
In PowerShell, use `Copy-Item .env.example .env`; on macOS/Linux, use
`cp .env.example .env`.

```sh
docker compose up -d postgres
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). Local PostgreSQL uses host port
`5433`. Provider data requires the corresponding imports or ingestion jobs;
starting the app does not download every league automatically.

Useful pages: `/machete/leagues`, `/machete/players`, `/machete/squad`,
`/baltika/leagues`, `/mixerr`, `/betting`, and `/admin/ingestion`.

See [local setup](docs/development/LOCAL_DEVELOPMENT.md) and the
[FotMob import guide](docs/integrations/MACHETE_FOTMOB_IMPORT.md).

## Checks

Run checks sequentially because Next.js type generation and builds both write
to `.next`:

```sh
npm run check
```

The command verifies the release version, runs unit tests and lint, checks
types, and builds the production application. Browser checks use
`npm run test:e2e`; database tests use `npm run test:db` and require the documented
test database setup.

## Data jobs and operations

```sh
npm run ingestion:status
npm run ingestion:queue-initial-backfill
npm run ingestion:worker
npm run prices:sync-sports-ru -- --league-id=47 --season=2026/2027 --hru=england --dry-run
npm run data:quality -- --league=47 --season=2025/2026
npm run model:backtest -- --league=47 --season=2024/2025 --expected-matches=380
npm run retention:prune-league-seasons -- --dry-run --date=2026-07-01
```

See [deployment](docs/operations/DEPLOYMENT.md),
[Docker production](docs/operations/DOCKER_PRODUCTION.md), and
[production monitoring](docs/operations/PRODUCTION_MONITORING.md) before operating
an instance. Provider availability and league coverage affect ingestion results.

## Status and limitations

Hockey is an isolated beta with explicit
[readiness gates](docs/guides/KHL_IMPLEMENTATION_STATUS.md). Fantasy Arena uses
virtual coins; payments, deposits, and withdrawals are outside its scope.
Research reports record observations for their stated dates and datasets.
Historical plans describe proposals and may differ from the current application.
The [work board](specs/BOARD.md) records unfinished work and external blockers.

## Repository layout

| Path | Contents |
|---|---|
| `src/` | App Router pages, components, providers, domain logic, and server workflows. |
| `prisma/` | Database schema, migrations, and seed tools. |
| `scripts/` and `ops/` | Data jobs, operator utilities, services, and timers. |
| `e2e/` | Browser tests. Domain tests are colocated with their code. |
| `public/` and `extensions/` | Static assets and the Sports.ru squad-transfer extension. |
| `docs/` | English documentation organized by topic, including an explicit archive. |
| `specs/` | Canonical contracts, technical ownership, work items, and verification evidence. |
| `.agents/` and `.claude/` | Matching entry points for the specification workflow. |

## Specification workflow

This repository uses a standalone specification workflow. Start at
[AGENTS.md](AGENTS.md) and the project `spec-driven-work` skill. Work status lives
in [BOARD.md](specs/BOARD.md); unfinished-session checkpoints live in
[WAL.md](specs/WAL.md). A live Prist service is not required.

Before claiming a tracked work item, copy `specs/.me.template` to `specs/.me`.
This local identity file is ignored by Git. See the
[agent guide](docs/development/AGENT_GUIDE.md) and
[work-item protocol](specs/protocols/WORK-ITEM-PROTOCOL.md).
