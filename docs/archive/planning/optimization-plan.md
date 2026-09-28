# Optimization Plan — CPU / RAM / Disk

The goal is to reduce the requirements for the processor, RAM and (primarily) the hard drive, while maintaining all the functionality.

## Architecture “after”

```
┌─────────────────────────────────────┐
│  fantasy-scout-web (single image)   │   ← multi-stage, output:"standalone"
│  ─ Next.js HTTP server              │
│  ─ instrumentation.ts:              │
│      • ensureDatabaseSchema (once)  │
│      • daily-sync scheduler         │
│      • retention scheduler          │
│      • ingestion worker loop        │
└─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│  postgres:16-alpine                 │
└─────────────────────────────────────┘
```

DB: no `raw` / `*Payload` / `rawMetrics` JSON duplicate columns. The raw payload (`RawMatchPayload`, `MacheteRawPayload`) lives only until the match is finalized - after `isFinal=true` the line is deleted in the same transaction as the recording of the normalized data.

---

## TASK 1 - Multi-stage Docker + `output:"standalone"` + combining web and worker into one container

Combines: multi-stage Docker, web+worker in one process, removing devDeps from runtime.

### 1.1 Next.js
To `next.config.mjs` add:
```js
output: "standalone",
```
This will create `.next/standalone/server.js` with minimal runtime (no devDeps, no full `node_modules`).

### 1.2 Transferring a worker inside the Next process
1. Create `src/server/ingestion-worker-loop.ts`:
   - Exports `startIngestionWorkerLoop()`.
   - Inside: `setInterval` (every ~10 s) → takes `IngestionJob` from `status='pending'` (`FOR UPDATE SKIP LOCKED` or equivalent via Prisma `$transaction` + `updateMany`), marks `running`, calls the general worker code.
   - Re-entrancy guard via `globalThis` (as in `src/server/machete-daily-sync.ts`).
   - Control via env flag `INGESTION_WORKER_IN_PROCESS` (by default `true`, in tests/CLI - `false`).
2. From `scripts/ingestion-runner.ts`, extract the common code into `src/core_data/worker.ts`. The script remains the CLI entry point for one-time manual runs in dev.
3. In `src/instrumentation.ts` add the call `startIngestionWorkerLoop()` after two existing schedulers.

### 1.3 Dockerfile (replace entire)
```dockerfile
# ───── deps stage ─────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ───── builder stage ─────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build
RUN npm prune --omit=dev

# ───── runtime stage ─────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

Key:
- `npm install` (not `npm ci`) only in `deps` - behavior from the original Dockerfile is preserved due to a mismatch of native-deps.
- `npm prune --omit=dev` after the build - devDeps (`typescript`, `eslint`, `tsx`, `@typescript-eslint`, `@types/*`) do not go to runtime.
- `tsx` is no longer needed in runtime, because the worker is built into Next.

### 1.4 docker-compose.yml
- Delete the entire `ingestion-worker` service.
- In the `web` service add env:
  - `INGESTION_WORKER_IN_PROCESS: "true"`
  - `MACHETE_DAILY_SYNC_ENABLED: "true"`
  - `LEAGUE_SEASON_RETENTION_ENABLED: "true"`
- Service `db-setup` (profile `setup`) leave as is.

### 1.5 Acceptance
- Runtime image ~300–500 MB (instead of ~1.5–2 GB).
- One Node process instead of two → ~250–400 MB RSS.
- `docker compose up` only starts `postgres` + `web`.

### 1.6 Contacts
- T5 (`ensureDatabaseSchema` once) uses the same `instrumentation.register()`.
- When restarting `web`, long backfills are survived at the expense of `IngestionCheckpoint`.

---

## TASK 2 - Dynamic import `exceljs`

Target: `exceljs` (23 MB) does not fall into the bundle of routes that do not work with Excel.

### 2.1 Files with static import
- `src/lib/importers/excel-workbook.ts`
- `src/machete/fantasy_price_sheet_import.ts`
- `src/app/api/machete/fantasy-prices/import-sheet/route.ts`
- Test `*.test.ts` - leave static import, does not affect runtime.

### 2.2 Replacement template
```ts
import type ExcelJS from "exceljs";  // только типы — runtime-стоимость 0

async function parseWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSLib } = await import("exceljs");
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
```

### 2.3 Steps
1. In `excel-workbook.ts`, replace all imports `exceljs` with `import type` + local `await import` inside functions.
2. The same in `fantasy_price_sheet_import.ts`.
3. The same in route `import-sheet/route.ts`.
4. `npm run build` → check that `exceljs` is only in the import route chunk.

### 2.4 Communication with T1
Dynamic import enhances the gain of `output:"standalone"`: `exceljs` does not fall into the starting dependency graph.

---

## TASK 3 - Destruction of JSON duplicates + immediate removal of `RawMatchPayload` after `isFinal=true`

The biggest task is to rework the database scheme and ingestion pipeline.

### 3.1 Principle
Raw payloads are stored for only one purpose: the ability to parse an unfinished match again when it is completed. After `isFinal=true` there is no need for raw data - there are normalized tables. All “duplicate” JSON fields in child tables are cut out.

### 3.2 Inventory of JSON columns
Before deletion - mandatory audit, because some fields are read in scoring/UI.

```bash
grep -rn "statsPayload" src/
grep -rn "eventPayload" src/
grep -rn "rawMetrics" src/
grep -rn "rosterPayload" src/
grep -rn "\.raw\b" src/
```

Classification (to be filled in based on the grep results):

| Field | If not readable | If readable |
|---|---|---|
| `RawMatchPayload.payload` | delete immediately after `isFinal=true` (see 3.3) | raise the required fields to normalized columns → delete |
| `MatchTeamStat.statsPayload` | drop column | put metrics in typed columns |
| `MatchPlayerStat.statsPayload` | drop column | same |
| `MatchEvent.eventPayload` | drop column | same |
| `MacheteFixture.raw` | drop | same |
| `MachetePlayer.raw` | drop | same |
| `MachetePlayerMatchStat.raw` | drop | same |
| `BaltikaFixture.raw` | drop | same |
| `BaltikaTeamMatchStat.raw` | drop | same |
| `TeamPlayerSeason.rosterPayload` | drop | same |
| `PlayerSnapshot.rawMetrics` | drop | is probably read by scoring formulas - see 3.5 |

### 3.3 Changing the ingestion pipeline
TO `src/core_data/raw_payload_store.ts`:
```ts
export async function store_raw_match_payload(prisma, input) {
  // если матч уже финальный — НЕ сохраняем raw, парсер уже отработал
  if (input.isFinal) {
    await prisma.rawMatchPayload.deleteMany({ where: { matchId: input.matchId } });
    return null;
  }
  return new RawPayloadRepository(prisma).upsert({ ... });
}
```

In `src/core_data/ingestion.ts` when the match is finalized:
```ts
await prisma.$transaction(async (tx) => {
  await persistNormalizedRows(tx, parsed);
  if (isFinal) {
    await tx.rawMatchPayload.delete({ where: { matchId } }).catch(() => null);
  }
});
```

The logic “parse → write normalized → delete raw” in one transaction is a guarantee that either there is raw (can be parsed) or there is normalized (raw is no longer needed).

### 3.4 Script `ingestion:reparse-raw`
Will only work for unfinished matches. The command code contains an understandable error for finalized matches: “match X is finalized, raw payload is not stored anymore — use initial-backfill to re-fetch.” Changing `parserVersion` now requires fetch again, not reparse - a conscious trade-off for saving disk space.

### 3.5 Prisma migration (`db push` + `db:safe-update`)
1. **Audit stage** (manual): go through the table 3.2, for each column decide - drop or promote.
2. **Promote**: for columns whose fields are read, add typed columns.
3. **Backfill script** `scripts/migrate-strip-json-payloads.ts`: in batches according to 1000, idempotent, supports dry-run.
4. **Schema change**: remove JSON columns in `schema.prisma`. Run `npm run db:safe-update`.
5. **Cleaning `raw_match_payloads`**:
   ```sql
   DELETE FROM raw_match_payloads
   WHERE EXISTS (SELECT 1 FROM matches m WHERE m.id = raw_match_payloads.match_id AND m.finished = true);
   ```
   In the script `scripts/prune-finalized-raw-payloads.ts`.

### 3.6 Acceptance
- Database size before/after: expected reduction in 5–20× for `matches`, `match_*`, `raw_match_payloads`.
- All tests in `src/core_data/*.test.ts` and `src/scoring/*.test.ts` are green.
- The parser is idempotent on repeated calls.

### 3.7 Communication with T4
T4 applies the same technique to `MacheteRawPayload`. Do it in one PR with T3.

---

## TASK 4 - Retention `MacheteRawPayload` (same technique as T3)

### 4.1 Principle
`MacheteRawPayload` - raw responses from the Machete provider to leagues/teams/players. Now he lives forever. We apply T3 logic.

### 4.2 Steps
1. Find record points: `grep -rn "macheteRawPayload" src/` (probably `src/providers/fotmob/client.ts` or `src/core_data/parsers/machete/`).
2. After successful parsing and writing of normalized strings (`MacheteLeague`, `MacheteTeam`, `MachetePlayer`, `MacheteFixture`, `MachetePlayerMatchStat`), delete the corresponding `MacheteRawPayload` in the same transaction.
3. If an audit-trail is needed for a specific `entityType` (for example, the fixture has not yet been played), leave the entry and add the column `expiresAt` (similar to `ShotmapComparisonsCache`), TTL 7 days. Cleaning - in `startLeagueSeasonRetentionScheduler`.
4. One-time cleaning script: `scripts/prune-machete-raw-payloads.ts`.

### 4.3 Communication with T1
In `instrumentation.ts` the retention scheduler is already starting - add a MacheteRawPayload bypass there.

---

## TASK 5 — `ensureDatabaseSchema` is called once at startup

### 5.1 Now
In `src/app/layout.tsx:37` `await ensureDatabaseSchema()` is called on every SSR render.

### 5.2 Changes
1. In `src/instrumentation.ts` inside `register()` - the very first step:
   ```ts
   const { ensureDatabaseSchema } = await import("@/lib/db");
   await ensureDatabaseSchema();
   ```
2. Remove the call `ensureDatabaseSchema()` from `src/app/layout.tsx`.
3. Check the idempotency of `ensureDatabaseSchema` (by name - yes, but make sure).

### 5.3 Communication with T1
Final order in `instrumentation.register()`:
```ts
await ensureDatabaseSchema();              // T5
startMacheteDailyFotMobSyncScheduler();    // existing
startLeagueSeasonRetentionScheduler();     // existing
startIngestionWorkerLoop();                // T1
```
`ensureDatabaseSchema` must be the first and `await` - schedulers rely on a ready-made circuit.

---

## TASK 6 - Adaptive polling intervals in the UI

### 6.1 Editing points
- `src/components/admin/IngestionAutoRefresh.tsx`
- `src/components/machete/MacheteSyncStatusBanner.tsx`
- `src/components/baltika/baltika-calendar-panel.tsx` (check - UX timer or polling)
- `src/components/players/player-watchlist.tsx` (check)

For each: find `setInterval(..., N)` or `useEffect` with an interval, determine the role (“realtime status” or “UX timer”).

### 6.2 General hook `src/lib/use-adaptive-poll.ts`
```ts
export function useAdaptivePoll<T>(fetcher: () => Promise<T>, options: {
  activeIntervalMs: number;   // 10000 — когда что-то идёт (sync running)
  idleIntervalMs: number;     // 60000 — когда стабильно idle
  initialIntervalMs: number;  // 5000  — после действий пользователя
  isActive: (data: T) => boolean;
}): T | null
```
Logic:
- we start from `initialIntervalMs`;
- if `isActive(data) === true` - interval = `activeIntervalMs`;
- if 3 fetch in a row the state does not change - backoff to `idleIntervalMs`;
- with unmount — clear timer.

### 6.3 Application
- `IngestionAutoRefresh`: `active=10s`, `idle=60s`, `initial=5s` — `isActive = job.status === 'running'`.
- `MacheteSyncStatusBanner`: `active=15s`, `idle=120s`.
- UX timers (toasts “copied”, submit-cooldown) do not touch.

### 6.4 Communication
Does not depend on T1–T5, can be done as a separate PR.

---

## TASK 7 - Cleaning local temporary files

### 7.1 Target
Do not leave ~75 MB of garbage on the developer's disk (`tmp_47_match_details.rds`, `tmp_fotmob_smoke/`, `sports_ru_*_backup_*.json`). They are already in `.gitignore` - a hygienic issue.

### 7.2 Steps
1. Delete files once:
   ```powershell
   Remove-Item -Recurse -Force tmp_47_match_details.rds, tmp_fotmob_smoke, sports_ru_*_backup_*.json -ErrorAction SilentlyContinue
   ```
2. Add npm script `clean:dev` to `package.json`, which removes `tmp_*`, `.next`, `tsconfig.tsbuildinfo`, `sports_ru_*_backup_*.json`.
3. Scripts like `fotmob:smoke` that create these files should be supplemented with the `--out-dir` parameter - by default write to `os.tmpdir()`, and not to the repo root.

### 7.3 Communication
Doesn't depend. Independent PR.

---

## Recommended merge order

```
PR-A (мелкий, низкий риск):
  T7 (clean), T5 (ensureDatabaseSchema), T2 (exceljs dynamic)

PR-B (инфра, изоляция):
  T1 (Docker multi-stage + worker in process)
  — после PR-A, чтобы init-логика была чистой

PR-C (БД, самый рискованный):
  T3 (RawMatchPayload + JSON-дубликаты) + T4 (MacheteRawPayload)
  — одним PR, миграция атомарная
  — обязательно с backup БД перед deploy

PR-D (UI, безрисковый):
  T6 (адаптивный polling)
```

PR-A and PR-D can be merged in parallel. PR-B is independent from PR-C in code, but it makes sense to PR-B first so that prod is already running on one process by the time the database is migrated.

---

## What doesn't change

- The external route API remains the same (no breaking changes).
- CLI commands `scripts/ingestion-runner.ts` are saved for dev/ops.
- Schedulers (`MACHETE_DAILY_SYNC_*`, `LEAGUE_SEASON_RETENTION_*`) save env flags; Only the launch location changes.
- Prisma remains, migrations are via `prisma db push` + `db:safe-update`.
- No third-party services (S3, Redis, queues) are added.
