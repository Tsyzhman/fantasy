# Improvement Backlog

## Implementation Status - 2026-06-08

- **Done in code:** 1 (timing-safe CRON secret), 2 (`/api/health`), 3 (App Router fallbacks), 4 (FotMob dev outputs use temp dirs + `--out-dir`), 5 (`/api/players?format=csv|xlsx` plus saved squad CSV/XLSX export), 6 (`ensureDatabaseSchema` runs through instrumentation), 7 (dynamic `exceljs` in runtime import paths), 8 (standalone Docker image + in-process worker), 10 (Prisma `000001_init` baseline migration for new installs), 11 (login/setup brute-force protection), 16 (Postgres-backed DB smoke test in CI), 17 (`npm audit` high/critical gate in CI), 19 (manual dry-run-first GitHub Actions PM2 deploy workflow), 20 (route-level user auth for shot-map API routes), 22 (`.env.example` password duplication warning), 23 (upload size guard before `arrayBuffer()`), 24 (safe FotMob request interval default), 25 (recursive logger secret redaction), 26 (neutral shot-coordinate module + `normalized_*` invariant).
- **Partially done / first pass:** 9 (raw payload audit + dry-run retention scripts; destructive column drops still intentionally avoided), 12 and 15 (shared API error wrapper + broader validation across API routes), 13 and 14 (configurable FotMob retries/timeouts + structured logging in core provider paths).
- **Requires a product/prod decision before code should proceed:** 18 (documentation consolidation needs agreement on archive/current sources), 21 (runtime DDL removal requires production DB backup and migration baseline). For existing production DBs, task 10 still requires one-time `prisma migrate resolve --applied 000001_init` before non-dry-run CD.

List of potential improvements to Fantasy Scout based on the results of the codebase audit.
Each idea is linked to specific files/modules. This is a backlog for approval and
planning is not a plan for immediate implementation.

Related documents: [optimization-plan.md](optimization-plan.md) (CPU/RAM/disk),
[ux-roadmap.md](ux-roadmap.md) (UX). Where the idea intersects with these plans is
is explicitly marked.

## Summary

| # | Task | Category | Difficulty | Risk | Priority |
|---|--------|-----------|-----------|------|-----------|
| 1 | Timing-safe CRON secret comparison | Fast | low | low | medium |
| 2 | Health-check endpoint `/api/health` | Fast | low | low | high |
| 3 | Error boundaries and loading states | Fast | low | low | high |
| 4 | Isolation of temporary dev script files | Fast | low | low | low |
| 5 | Export player/lineup tables CSV/XLSX | Feature | medium | low | medium |
| 6 | `ensureDatabaseSchema` once at startup | Architecture | low | low | high |
| 7 | Dynamic import `exceljs` | Architecture | low | low | medium |
| 8 | Multi-stage Docker + worker in progress | Architecture | high | medium | medium |
| 9 | Removal of JSON duplicates + payload retention | Architecture | high | high | medium |
| 10 | Prisma versioned migrations | Architecture | medium | medium | medium |
| 11 | Login brute force protection | Security | medium | low | high |
| 12 | Unified API error handler | Reliability | average | low | average |
| 13 | FotMob provider stability | Reliability | average | average | average |
| 14 | Structured logging | Reliability | average | low | average |
| 15 | Schema validation of input data API | Reliability | medium | low | medium |
| 16 | API integration tests on the database | Tests | medium | low | medium |
| 17 | `npm audit` in CI | Security | low | low | low |
| 18 | Documentation consolidation | Documentation | low | low | low |
| 19 | Deployment automation (CD) | DevOps | medium | medium | low |
| 20 | Bypassing authorization in shot-map routes | Security | low | low | high |
| 21 | Destructive runtime-DDL and `db push --accept-data-loss` | Reliability | average | high | high |
| 22 | `.env.example`: duplicate database password | DevOps | low | low | medium |
| 23 | Checking the upload size before reading into memory | Reliability | low | low | medium |
| 24 | Default `MACHETE_FOTMOB_REQUEST_INTERVAL_MS` | Code quality | low | low | medium |
| 25 | Masking secrets in the logger | Security | low | low | medium |
| 26 | Invariant `normalized_*` + transfer of coordinate module | Code quality | low | low | low |

---

## Quick improvements

### 1. Timing-safe comparison of CRON secret

- **Type:** safety
- **Description:** In `src/lib/cron-auth.ts:9` the secret is compared to the usual
  `authorization !== "Bearer " + expectedSecret`. Replace with
  `crypto.timingSafeEqual` (as already done for passwords in `src/lib/auth.ts:62`),
  carefully handling different line lengths.
- **Why:** eliminates the theoretical timing attack on the selection of `CRON_SECRET`;
  uniformity with `auth.ts`.
- **Where:** `src/lib/cron-auth.ts`; update/check test
  `src/app/api/cron/cron-auth.test.ts`.
- **Difficulty:**low ·**Risk:**low ·**Priority:** medium
- **Agree:** nothing, straight replacement.

### 2. Health-check endpoint `/api/health`

- **Type:** DevOps
- **Description:** There is no Health endpoint (only `ingestion/status` and
  `machete/sync-status` for authorization). Add light public `/api/health`:
  database check (`SELECT 1`), returns `{ status, version?, uptime? }`.
- **Why:** liveness check point for Docker/PM2/monitoring; deployment by
  `docs/operations/DEPLOYMENT.md` is now blind.
- **Where:** new `src/app/api/health/route.ts`; add path to `publicPrefixes`
  to `middleware.ts:7`; `healthcheck` to `docker-compose.yml`.
- **Difficulty:**low**Risk:**low**Priority:** high
- **Agree:** amount of data is unauthorized (minimum `{status:"ok"}`, without
  circuit details).

### 3. Error boundaries and loading states in App Router

- **Type:** UX
- **Description:** There are no `error.tsx`, `global-error.tsx` in `src/app`,
  `not-found.tsx`, `loading.tsx`. If there is a rendering/fetch error, the user sees
  default crash Next.
- **Why:** skeleton-loading and neat fallback instead of a white screen for
  heavy screens (squad planner, MiXerr, ingestion).
- **Where:** `src/app/error.tsx`, `src/app/global-error.tsx`,
  `src/app/not-found.tsx` + spot `loading.tsx`.
- **Difficulty:**low**Risk:**low**Priority:** high
- **Agree:** design/copyright fallback, taking into account RU localization.

### 4. Isolation of temporary dev files of FotMob scripts

- **Type:** DevOps
- **Description:** `optimization-plan` TASK 7 partially done (script `clean:dev`
  is already in `package.json`). All that remains is to add the parameter `--out-dir` to `fotmob:smoke`
  and `fotmob:inspect`, by default write to `os.tmpdir()`, and not to the root of the repo.
- **Why:** ~75 MB of garbage (`tmp_*`, `sports_ru_*_backup_*.json`) on disk
  developer.
- **Where:** `scripts/fotmob-smoke.ts`, `scripts/fotmob-inspect.ts`.
- **Difficulty:**low**Risk:**low**Priority:** low
- **Agree:** nothing, consistent with the adopted plan.

---

## Useful features

### 5. Export player and roster tables to CSV/XLSX

- **Type:** feature
- **Description:** The project can import xlsx (`exceljs`) and has a “Copy link”,
  but there is no export of filtered tables/shortlists. Add export current
  player explorer selection and saved squad.
- **Why:** scouts work in Excel; export closes the cycle import → analysis →
  unloading.
- **Where:** `src/app/machete/players`, `src/app/baltika/players`, squad planner;
  reuse `exceljs`.
- **Difficulty:**medium**Risk:**low**Priority:** medium
- **Agree:** format and set of columns; export on server or client.

---

## Architectural improvements

> Ideas 6–9 coincide with `optimization-plan.md` (TASK 5/2/1/3+4 respectively).

### 6. Call `ensureDatabaseSchema` once at startup

- **Type:** architecture / performance `optimization-plan` TASK 5
- **Description:** Now `await ensureDatabaseSchema()` is called for every
  SSR render (`src/app/layout.tsx`). Transfer to `src/instrumentation.ts`
  `register()` The very first step is to remove from `layout.tsx`.
- **Why:** unnecessary schema check on each request - load on the database and latency.
- **Where:** `src/app/layout.tsx`, `src/instrumentation.ts`, `src/lib/db.ts`.
- **Difficulty:**low**Risk:**low**Priority:** high
- **Agree:** confirm idempotency `ensureDatabaseSchema`; isn't it
  SSR paths bypassing instrumentation.

### 7. Dynamic import `exceljs`

- **Type:** architecture / performance `optimization-plan` TASK 2
- **Description:** `exceljs` (~23 MB) is imported statically. Translate to
  `import type ExcelJS` + local `await import("exceljs")` inside functions.
- **Why:** `exceljs` does not fall into the starting dependency graph and bundle
  routes without Excel.
- **Where:** `src/lib/importers/excel-workbook.ts`,
  `src/machete/fantasy_price_sheet_import.ts`,
  `src/app/api/machete/fantasy-prices/import-sheet/route.ts`. B `*.test.ts`
  leave static import.
- **Difficulty:**low ·**Risk:**low ·**Priority:** medium
- **Agree:** nothing.

### 8. Multi-stage Docker + `output:"standalone"` + worker in progress

- **Type:** architecture / DevOps `optimization-plan` TASK 1
- **Description:** Combine web and `ingestion-worker` into one process via
  `instrumentation.ts` (`startIngestionWorkerLoop`), enable
  `output:"standalone"` to `next.config.mjs`, multi-stage `Dockerfile` with
  `npm prune --omit=dev`, remove the service `ingestion-worker` from compose.
- **Why:** image ~300–500 MB instead of ~1.5–2 GB; one Node process instead of two.
- **Where:** `Dockerfile`, `next.config.mjs`, `docker-compose.yml`,
  `src/server/ingestion-worker-loop.ts` (new), `src/core_data/worker.ts`,
  `scripts/ingestion-runner.ts` (remains CLI).
- **Difficulty:**high**Risk:**medium**Priority:** medium
- **Agree:** downtime window for product roll; restart strategy for long periods
  backfill (support on `IngestionCheckpoint`). Preferably after task 6.

### 9. Removing JSON duplicates and retention of raw payloads

- **Type:** architecture / performance `optimization-plan` TASK 3/4
- **Description:** Delete `RawMatchPayload`/`MacheteRawPayload` after `isFinal=true`
  in one transaction with normalized data entry; cut out duplicates
  JSON columns (`statsPayload`, `eventPayload`, `rawMetrics`, `raw`,
  `rosterPayload`) after an audit of readers.
- **Why:** database reduction in 5–20× using heavy tables.
- **Where:** `prisma/schema.prisma`, `src/core_data/ingestion.ts`,
  `raw_payload_store.ts`, scripts `prune-*-raw-payloads.ts`.
- **Difficulty:**high**Risk:**high**Priority:** medium
- **Agree:** MANDATORY DB backup; audit which JSON fields are actually read
  scoring/UI before drop. Depends on task 10.

### 10. Switch from `prisma db push` to versioned migrations

- **Type:** architecture / reliability
- **Description:** Deployment and CI use `prisma db push` + self-written
  `db:safe-update` (`package.json`, `docs/operations/DEPLOYMENT.md`) - without migration history,
  rollback and audit. Go to `prisma migrate` from baseline existing
  prod-schemes.
- **Why:** versioning, rollback and review of schema changes; foundation for
  for safe drop columns (task 9) and for CD (task 19).
- **Where:** `prisma/`, scripts `db:*` in `package.json`,
  `.github/workflows/check.yml`, `docs/operations/DEPLOYMENT.md`.
- **Difficulty:**medium**Risk:**medium**Priority:** medium
- **Agree:** full transition to `migrate` vs `db push` for dev + `migrate`
  for prod; correct baseline of the existing database.

---

## Safety and reliability

### 11. Rate-limiting / brute force protection on login

- **Type:** safety
- **Description:** Server action login (`src/app/login/page.tsx:82`) causes
  `verifyPassword` without limiting the number of attempts, delay or blocking. Same
  for `/setup`.
- **Why:** self-written password authentication without throttling is vulnerable to
  password brute force.
- **Where:** `src/app/login/page.tsx`, `src/app/setup/page.tsx`, general helper in
  `src/lib/`.
- **Difficulty:**medium**Risk:**low**Priority:** high
- **Agree:** mechanism without Redis (plan prohibits new services) - counter
  attempts in PostgreSQL via email/IP; thresholds and blocking times.

### 12. Unified error handler for API routes

- **Type:** reliability
- **Description:** Only 11 from 39 routes have `try/catch`. Uncaught exception
  (for example, in `runMacheteJob` from `sync-full/route.ts`) gives the default 500 without
  structured `{error:{code,message}}` adopted in the project, and can
  leak stack trace.
- **Why:** uniform error format, no stack trace leak, predictability
  for the frontend.
- **Where:** new helper wrapper in `src/lib/` (eg `withApiHandler`), apply
  to all `route.ts`.
- **Difficulty:**medium**Risk:**low**Priority:** medium
- **Agree:** wrapper design (HOF vs manual try/catch); set of error codes.

### 13. Resiliency of unofficial FotMob provider

- **Type:** reliability / safety
- **Description:** `UnofficialFotMobClient` (`src/providers/fotmob/client.ts`)
  scrapes `buildId` from the home page, pulls unsigned next-data, has
  limited retrays. Fragile (breaks when FotMob is thinned out) and a gray area in terms of ToS.
- **Why:** change on the FotMob side breaks ingestion; need retrays with backoff
  and alerts when errors increase.
- **Where:** `src/providers/fotmob/client.ts`, `jobs.ts`, env
  `MACHETE_FOTMOB_PROVIDER_MODE`.
- **Difficulty:**medium**Risk:**medium**Priority:** medium
- **Agree:** legal admissibility of the unofficial regime in production; plan
  transition to a licensed provider (`real` mode is already reserved in .env).

### 14. Structured logging and observability

- **Type:** DevOps / reliability
- **Description:** The structure logger is only available in `src/core_data/worker.ts`; in
  otherwise ~40 `console.*` without levels and correlation. There are no ingestion metrics.
- **Why:** with background jobs and scraping without normal logs/metrics it’s difficult
  diagnose failures in the product (PM2/Docker).
- **Where:** general `src/lib/logger.ts`, replace `console.*` according to the project; metrics
  success/errors of ingestion.
- **Difficulty:**medium**Risk:**low**Priority:** medium
- **Agree:** format (JSON logs?), without adding external services according to
  `optimization-plan`.

### 15. Schema validation of API input data

- **Type:** reliability / safety
- **Description:** `zod` not used; the request body is parsed manually via
  `readJsonObject` (`src/lib/request-json.ts`) with manual checks. Enter
  schema-validation of API bodies/queries with uniform 400- responses.
- **Why:** reduces the risk of raw types, documents contracts, uniform
  Validation errors.
- **Where:** all `route.ts` with body/parameters; general parsing layer.
- **Difficulty:**medium**Risk:**low**Priority:** medium
- **Agree:** add dependency `zod` or write minimal zero-dep
  validators (the latter is closer to the spirit of the project). Link to task 12.

---

## Tests and code quality

### 16. Integration tests of API routes on a real database

- **Type:** tests
- **Description:** Tests are strong at the kernel/scoring/parser level, but CI
  (`.github/workflows/check.yml`) does not raise PostgreSQL - routes with real
  Prisma queries are not covered by integration.
- **Why:** regressions in SQL/Prisma logic and route authorization are now caught
  manual only.
- **Where:** CI workflow (`services: postgres`), a new layer of tests for critical
  routes (auth, ingestion, squads).
- **Difficulty:**medium**Risk:**low**Priority:** medium
- **Agree:** which routes have priority; valid CI run time.

### 17. Add `npm audit` to CI

- **Type:** security / DevOps
- **Description:** `--no-audit` (CI, `Dockerfile`) is used throughout. No
  automatic checking of dependency vulnerabilities (package-lock ~300 KB).
- **Why:** early detection of CVE in transitive dependencies.
- **Where:** separate step in `.github/workflows/check.yml`
  (`npm audit --omit=dev`) or connect Dependabot.
- **Difficulty:**low**Risk:**low**Priority:** low
- **Agree:** severity level (fail at high/critical) or report only.

---

## Documentation and support

### 18. Consolidation of duplicate documentation

- **Type:** documentation
- **Description:** Intersecting layers: `docs/development/AGENT_GUIDE.md`, `prompts/CODEX_*`,
  `product/`, `implementation-notes/`, plus current `docs/`.
  `docs/development/AGENT_GUIDE.md` describes an early Excel-first MVP concept diverging
  with the current three modes (Machete/Baltika/MiXerr).
- **Why:** It is difficult for a new contributor/agent to understand what is relevant.
- **Where:** root `*.md`, `docs/`, `product/`, `prompts/`,
  `implementation-notes/`.
- **Difficulty:**low**Risk:**low**Priority:** low
- **Agree:** what to archive and what to leave as historical context.

### 19. Deployment automation (CD)

- **Type:** DevOps
- **Description:** Deploy - manual checklist PM2 in `docs/operations/DEPLOYMENT.md`
  (`git pull && build && pm2 restart`). No automation/rollback; problem with
  `.next/prerender-manifest.json` is a symptom of manual steps.
- **Why:** manual steps → risk of human error.
- **Where:** GitHub Actions deploy workflow or `scripts/start-production.sh` +
  migration.
- **Difficulty:**medium**Risk:**medium**Priority:** low
- **Agree:** access to the production server from CI; rollback strategy. Depends on
  tasks 10.

---

## Audit 2026-06-09 - additional tasks

> Found during a re-audit of the codebase. Controversial decisions have already been made and
> are reflected in the “Solution” fields (see below), they do not require separate approval,
> except where explicitly noted.

### 20. Bypassing authorization in shot-map routes

- **Type:**safety**Priority:** high
- **Description:**`middleware.ts:25` skips the request for fact**availability**
  non-empty session-cookie (`Boolean(request.cookies.get(sessionCookieName)?.value)`),
  without checking its validity. At the same time, the routes
  `src/app/api/teams/[teamId]/shot-map/for/route.ts`,
  `src/app/api/teams/[teamId]/shot-map/against/route.ts`,
  `src/app/api/shot-map/compare/route.ts`,
  `src/app/api/players/[snapshotId]/shot-map/route.ts` **do not call**
  `requireApiUser()` and send data from the database. Result: request with arbitrary
  `Cookie: <sessionCookieName>=x` passes middleware and receives data without
  valid session. The remaining routes are protected by their own `requireApiUser`/
  `requireApiAdmin`, so the middleware is not actually an authorization layer.
- **Why:** close access control bypass (defense-in-depth); bring routes to
  to a single project authorization contract.
- **Where:** four `route.ts` above; sample - any route calling
  `requireApiUser()` (`src/lib/auth.ts:152`).
- **Solution:**access to the shot-map is granted to any** authorized
  user (USER role)**, not admin-only. At the beginning of each handler add
  `const auth = await requireApiUser(); if (auth.response) return auth.response;`.
  Primary protection is in the route, not in the middleware.
- **Difficulty:**low**Risk:** low
- **Tests:** add integration check “without a valid session → 401” (see.
  task 16).

### 21. Destructive runtime-DDL and `prisma db push --accept-data-loss`

- **Type:**reliability/architecture**Priority:** high reinforces the task 10
- **Description:** The scheme is controlled by three mechanisms simultaneously: migration
  Prisma (`prisma/migrations/000001_init`), large idempotent `DO $$ … $$`
  block in runtime (`src/lib/db.ts:25-347`, called from
  `src/instrumentation.ts:9`) and `npx prisma db push --accept-data-loss`
  (`docker-compose.yml:56`). **data mutations** are performed inside the runtime block:
  `DELETE FROM "MachetePlayerSnapshot"` (`src/lib/db.ts:50-53`) and
  `UPDATE "match_shots" …` (`src/lib/db.ts:319-334`) - as a side effect
  of the first request to the database when the container starts.
- **Why:** remove schema drift (three sources of truth), destructive operations
  at startup and the risk of silent data loss from `--accept-data-loss` in production.
- **Where:** `src/lib/db.ts`, `src/instrumentation.ts`, `docker-compose.yml`,
  `prisma/`, scripts `db:*` to `package.json`.
- **Solution:** full transition to `prisma migrate deploy` (close task 10);
  move the contents of `ensureDatabaseSchema` to versioned migrations and remove
  runtime-DDL; replace `db push --accept-data-loss` with `migrate deploy` in compose.
  In runtime, leave a maximum of a light “migrations applied” check, without DDL and without
  mutation data.
- **Difficulty:**medium**Risk:** high
- **Coordination (required):** backup of the production database and baseline of the existing schema
  (`prisma migrate resolve --applied 000001_init`) before the first non-dry-run.
- **Tests:** running migrations on a clean database in CI (intersects with task 16) + dry-run.

### 22. `.env.example`: database password is duplicated in two variables

- **Type:**DevOps / reliability**Priority:** medium
- **Description:** `.env.example:2-5` contains `POSTGRES_PASSWORD="replace-me"` and that
  is the same password inside `DATABASE_URL="postgresql://fantasy_app:replace-me@…"`. When
  change `POSTGRES_PASSWORD` needs to be manually edited and `DATABASE_URL`; forgotten - gives
  Difficult to diagnose authentication error. `docker-compose.yml` collects URL
  from `${POSTGRES_PASSWORD}`, local `.env` - no.
- **Why:** remove footgun of local start; goal "reproducible local"
  launch."
- **Where:** `.env.example`.
- **Solution:** add an explicit comment “if you change the password, update BOTH lines”
  next to `POSTGRES_PASSWORD` and `DATABASE_URL`. URL decomposition to host/port/db is not possible We do
  so as not to complicate the local scenario.
- **Difficulty:**low**Risk:** low

### 23. The upload size is checked after the file is read into memory

- **Type:**reliability / performance**Priority:** medium
- **Description:** `src/app/api/admin/teams/[teamId]/upload/route.ts:33-39` performs
  `Buffer.from(await upload.arrayBuffer())` **to** `importWyscoutPlayersForTeam`, and
  limit `MAX_UPLOAD_MB` is checked internally (`validateXlsxUpload`,
  `src/server/baltika/workbook-imports.ts:434-436`). The entire file is buffered until
  checks. (`bodySizeLimit: "25mb"` in `next.config.mjs:15` refers to Server
  Actions, not for this API route - check at the stand.)
- **Why:** remove memory-spike from large files. The risk is limited - the route is under
  `requireApiAdmin`.
- **Where:** `upload/route.ts`.
- **Solution:** check `upload.size` against `MAX_UPLOAD_MB` immediately after
  `upload instanceof File` and up to `arrayBuffer()`; return 400 `FILE_TOO_LARGE` to
  reading. Leave the check inside `validateXlsxUpload` as the second line.
- **Difficulty:**low**Risk:** low

### 24. Default mismatch `MACHETE_FOTMOB_REQUEST_INTERVAL_MS`

- **Type:**code quality/documentation**Priority:** medium
- **Description:** `src/providers/fotmob/client.ts:69` uses default `0` (and
  comments "Default 0"), while `.env.example:39` states "1500ms is the
  safe default" and sets `1500`. When launched without `.env`, the worker does not throttle.
- **Why:** remove code/documentation discrepancy; reduce the risk of running into
  rate-limit FotMob with default configuration.
- **Where:** `src/providers/fotmob/client.ts:66-69`, `.env.example:37-39`.
- **Solution:**force code to safe default**1500 ms** (not 0); update
  comment in `client.ts` for the new value. Ability to disable throttling
  via `MACHETE_FOTMOB_REQUEST_INTERVAL_MS=0` save.
- **Difficulty:**low**Risk:** low
- **Tests:** unit on `throttle()`/reading env in the absence of a variable.

### 25. Logger does not mask secrets

- **Type:**security/logging**Priority:** medium
- **Description:** `src/lib/logger.ts:50-64` (`serializeFields`) writes the fields as is,
  `Error` is serialized with `stack`. Now secrets (`MACHETE_FOTMOB_COOKIE`,
  `CRON_SECRET`, `authorization`) are not included in the logs, but the protection only lasts
  discipline of callers - one careless `logger.*("...", { headers })` will lead
  to leak.
- **Why:** to prevent secrets/tokens from getting into the logs.
- **Where:** `src/lib/logger.ts`.
- **Solution:** in `serializeFields`/`serializeValue` add denylist keys
  (case-insensitive: `cookie`, `authorization`, `secret`, `token`, `password`,
  `x-mas`) with the value replaced by `"[REDACTED]"`, including nested objects.
- **Difficulty:**low**Risk:** low
- **Tests:** unit “sensitive keys are masked, the rest are saved.”

### 26. Fix the invariant `normalized_*` and transfer the coordinate module

- **Type:**code quality/architecture**Priority:** low
- **Description:** Refactor (`src/mixer/shot-coordinates.ts` + tests) reduced
  duplicated `normalizeFotMobAxis`/`sameCoordinate` into one module - correct and
  is covered with tests. New `normalized_shot_axis_coordinate` counts saved
  `normalized_*` authoritative (percentage). Recording path
  (`src/providers/fotmob/shots.ts:61-82`) actually writes to `normalized_*`
  are percentages (0–100), while `x/y` is meters, so the behavior is equivalent to the old one.
  The assumption “`normalized_*` is always a percentage” is not recorded anywhere. In addition,
  `src/providers/fotmob/shots.ts:7` re-exports `normalize_fotmob_pitch_coordinates`
  from `@/mixer/shot-coordinates` - `providers` begins to depend on `mixer`.
- **Why:** protect the invariant from future regressions of ingestion; straighten
  direction of layer dependence.
- **Where:** `src/mixer/shot-coordinates.ts`, circuit `match_shots`,
  `src/providers/fotmob/shots.ts`.
- **Solution:** (1) add invariant comment “`normalized_*` are stored in
  percent 0–100" in `shot-coordinates.ts` and next to the columns `match_shots`;
  (2) if appropriate, transfer the general coordinate module to the neutral layer
  (`src/lib/` or `src/core_data/`) and remove re-export from `shots.ts`. Current
  refactor can be committed as is.
- **Difficulty:**low**Risk:** low

---

## Recommended order

**First**(high priority, low risk):**20** (authorization bypass), 2, 3, 6
→ then 1 and 11.

**Fast low-risk package** (one PR possible): 22, 23, 24, 25, 26 - small
edits without migrations.

**Second tier** (medium risk): 12 + 15 (together), 14, then 8 (after 6).

**Postponed / requires approval:**

- 21 → part of transition to migrations (task 10); requires a backup of the database and baseline.
- 9 → requires 10 (migration) and a mandatory database backup.
- 10 → foundation for 9, 19 and 21; you need a baseline production scheme.
- 19 → depends on 10.
- 13 → requires a decision on the legal status of FotMob.

**Dependencies:** 9 → 10 · 21 → 10 · 19 → 10 · 8 → preferably after 6 · 12 ↔ 15.
