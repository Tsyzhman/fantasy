# Audit Tasks - 2026-06-16

Source: full project audit performed on 2026-06-16.

This document stores issue-ready backlog items from the audit: each task has scope, affected files, acceptance criteria, and verification commands.

## Project: Database And Production Reliability

### 1. [Critical] Make Prisma migrations the only database schema source of truth

Problem:
Database schema is currently controlled by Prisma migrations, runtime DDL in `src/lib/db.ts`, and additive SQL in `scripts/apply-safe-db-update.ts`. `ensureDatabaseSchema()` also mutates data at startup by deleting duplicate `MachetePlayerSnapshot` rows and updating `match_shots.source_fingerprint`.

Files:
- `src/lib/db.ts`
- `src/instrumentation.ts`
- `scripts/apply-safe-db-update.ts`
- `prisma/migrations/000001_init/migration.sql`

Acceptance criteria:
- Runtime startup no longer runs `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DELETE`, or `UPDATE`.
- Remaining runtime-created tables, indexes, and constraints are represented by versioned Prisma migrations.
- Fresh database can be created with `npm run prisma:migrate:deploy` only.
- Existing production upgrade path is documented with backup and baseline steps.
- DB integration test passes against a migrated database.

Verification:
- `npm run prisma:migrate:deploy`
- `npm run test:db`
- `npm run check`

### 2. [Critical] Replace Docker `db push --accept-data-loss` with safe migration deployment

Problem:
`docker-compose.yml` runs `npx prisma db push --accept-data-loss` in the setup service. This is not acceptable for production data.

Files:
- `docker-compose.yml`
- `docs/operations/DOCKER_PRODUCTION.md`
- `docs/operations/DEPLOYMENT.md`
- `package.json`

Acceptance criteria:
- Docker setup uses `npm run prisma:migrate:deploy`.
- No production path uses `prisma db push --accept-data-loss`.
- Docker production runbook explains baseline requirements for an existing database.
- Setup still supports a clean empty database.

Verification:
- `docker compose --profile setup run --rm db-setup npm run prisma:migrate:deploy`
- `docker compose up -d web`

### 3. [High] Remove unsafe default production secrets from Compose

Problem:
`docker-compose.yml` defaults `CRON_SECRET` to `strong-secret` and `NEXTAUTH_SECRET` to a placeholder. Current custom auth does not use `NEXTAUTH_SECRET`, while cron does use `CRON_SECRET`. A forgotten env value leaves cron protected by a known string.

Files:
- `docker-compose.yml`
- `.env.example`
- `src/lib/auth.ts`
- `src/lib/cron-auth.ts`

Acceptance criteria:
- `CRON_SECRET` has no insecure fallback in production compose.
- Unused `NEXTAUTH_*` variables are either removed or documented as unused by the current custom auth implementation.
- Startup/setup fails clearly when required secrets are missing.
- Docs show exact required env vars.

Verification:
- `docker compose config`
- `npm run test`

### 4. [High] Add migration drift and shadow DB checks to CI

Problem:
Local audit could validate the Prisma datamodel, but could not diff migrations because `--from-migrations` requires a shadow database and local Docker daemon was unavailable. CI already has Postgres, so it should catch migration drift explicitly.

Files:
- `.github/workflows/check.yml`
- `package.json`

Acceptance criteria:
- CI runs a Prisma migration drift check using a shadow database.
- CI fails when `prisma/schema.prisma` and migrations diverge.
- Command is documented for local use.

Verification:
- GitHub Actions check run
- Local equivalent with configured `DATABASE_URL` and `SHADOW_DATABASE_URL`

## Project: Security And Operations

### 5. [High] Enforce upload size limits before buffering workbook files

Problem:
Some upload routes check size before `arrayBuffer()`, but `request.formData()` still parses the multipart body into memory. Other routes still call `arrayBuffer()` without an early route-level size check. Admin-only reduces exposure, but the memory spike remains real.

Files:
- `src/lib/request-form-data.ts`
- `src/app/api/admin/teams/[teamId]/upload/route.ts`
- `src/app/api/baltika/teams/[teamId]/team-stats/upload/route.ts`
- `src/app/api/baltika/leagues/[leagueId]/bulk-upload/route.ts`
- `src/app/api/machete/fantasy-prices/import-sheet/route.ts`
- `src/server/baltika/workbook-imports.ts`

Acceptance criteria:
- Every workbook upload route checks file size before `arrayBuffer()`.
- Multipart/body limits are enforced before full buffering where Next.js/runtime allows it.
- Bulk upload rejects oversized files individually with a structured error.
- Existing importer validation remains as a second line of defense.

Verification:
- Add route tests for oversized files.
- `npm run test`

### 6. [Medium] Resolve production dependency audit warning for `exceljs -> uuid`

Problem:
`npm run audit:prod` reports 2 moderate vulnerabilities through `exceljs@4.4.0 -> uuid@8.3.2`. The current audit gate is `--audit-level=high`, so CI ignores this. `npm audit fix --force` suggests a breaking downgrade to `exceljs@3.4.0`, which is not a real fix without testing.

Files:
- `package.json`
- `package-lock.json`
- workbook importer/exporter paths using `exceljs`

Acceptance criteria:
- Decide whether moderate production advisories should fail CI.
- Resolve or explicitly accept the `uuid` advisory with documented rationale.
- If changing `exceljs`, workbook import/export tests still pass.

Verification:
- `npm run audit:prod`
- `npm run test`

## Project: Frontend And UX

### 7. [High] Fix disabled pagination links and localize pagination controls

Problem:
Player explorer pagination uses `Link` with `aria-disabled` and `pointer-events-none`. Mouse clicks are blocked, but keyboard activation can still navigate. Labels `Prev` and `Next` are not localized.

Files:
- `src/app/machete/players/page.tsx`
- `src/app/baltika/players/page.tsx`

Acceptance criteria:
- Disabled pagination controls are not keyboard-activatable links.
- Controls remain accessible to screen readers.
- Labels are localized through existing i18n components.
- Existing query parameters are preserved.

Verification:
- Keyboard test on first and last page.
- `npm run lint`
- `npm run build`

### 8. [Medium] Reduce Machete player explorer in-memory aggregation work

Problem:
Machete player explorer loads and aggregates rows, sorts them in memory, then paginates with `slice`. Position filtering is not passed to `loadSharedMachetePlayerRows`, even though the helper supports it. This is not a functional bug now, but it is the obvious latency/RAM failure point for full multi-league data.

Files:
- `src/app/machete/players/page.tsx`
- `src/machete/shared_read_model.ts`

Acceptance criteria:
- Position filter is pushed into `loadSharedMachetePlayerRows`.
- Page render avoids unnecessary full-scope work where possible.
- Add or update tests for filtered Machete rows.
- No behavior regression for multi-competition combined rows.

Verification:
- `npm run test`
- Manual check of `/machete/players` filters

## Project: Documentation

### 9. [Medium] Bring architecture and product docs up to current product reality

Problem:
`docs/reference/ARCHITECTURE.md` and `docs/product/PRODUCT_BRIEF.md` still describe a Wyscout-first MVP. The actual app is now Machete, Baltika, MiXerr, shared FotMob core, Sports.ru fantasy prices, squads, ingestion jobs, and shot maps. Documentation is stale enough to mislead onboarding and future audits.

Files:
- `docs/reference/ARCHITECTURE.md`
- `docs/reference/DATA_MODEL.md`
- `docs/reference/API_ROUTES.md`
- `docs/product/PRODUCT_BRIEF.md`
- `README.md`

Acceptance criteria:
- Architecture doc reflects the three current modes.
- Data model doc describes both legacy Baltika tables and shared core FotMob tables.
- Product brief no longer claims Wyscout MVP as the whole product.
- Docs explain which files are historical/reference and which are current.

Verification:
- Documentation review against current route list and Prisma model list.
