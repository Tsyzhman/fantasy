# Optimization Plan — CPU / RAM / Disk

Цель — сократить требования к процессору, оперативке и (в первую очередь) к жёсткому диску, сохранив весь функционал.

## Архитектура «после»

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

БД: никаких `raw` / `*Payload` / `rawMetrics` JSON-колонок-дубликатов. Сырой payload (`RawMatchPayload`, `MacheteRawPayload`) живёт только пока матч не финализирован — после `isFinal=true` строка удаляется в той же транзакции, что и запись нормализованных данных.

---

## TASK 1 — Multi-stage Docker + `output:"standalone"` + объединение web и worker в один контейнер

Объединяет: multi-stage Docker, web+worker в одном процессе, удаление devDeps из runtime.

### 1.1 Next.js
В `next.config.mjs` добавить:
```js
output: "standalone",
```
Это создаст `.next/standalone/server.js` с минимальным runtime (без devDeps, без полного `node_modules`).

### 1.2 Перенос воркера внутрь Next-процесса
1. Создать `src/server/ingestion-worker-loop.ts`:
   - Экспортирует `startIngestionWorkerLoop()`.
   - Внутри: `setInterval` (каждые ~10 с) → берёт `IngestionJob` со `status='pending'` (`FOR UPDATE SKIP LOCKED` или эквивалент через Prisma `$transaction` + `updateMany`), помечает `running`, вызывает общий код воркера.
   - Re-entrancy guard через `globalThis` (как в `src/server/machete-daily-sync.ts`).
   - Управление через env-флаг `INGESTION_WORKER_IN_PROCESS` (по умолчанию `true`, в тестах/CLI — `false`).
2. Из `scripts/ingestion-runner.ts` выделить общий код в `src/core_data/worker.ts`. Скрипт остаётся CLI-точкой входа для разовых ручных запусков в dev.
3. В `src/instrumentation.ts` добавить вызов `startIngestionWorkerLoop()` после двух существующих шедулеров.

### 1.3 Dockerfile (заменить целиком)
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

Ключевое:
- `npm install` (а не `npm ci`) только в `deps` — сохраняется поведение из исходного Dockerfile по причине несовпадения native-deps.
- `npm prune --omit=dev` после билда — devDeps (`typescript`, `eslint`, `tsx`, `@typescript-eslint`, `@types/*`) не попадают в runtime.
- `tsx` больше не нужен в runtime, т.к. воркер встроен в Next.

### 1.4 docker-compose.yml
- Удалить сервис `ingestion-worker` целиком.
- В сервисе `web` добавить env:
  - `INGESTION_WORKER_IN_PROCESS: "true"`
  - `MACHETE_DAILY_SYNC_ENABLED: "true"`
  - `LEAGUE_SEASON_RETENTION_ENABLED: "true"`
- Сервис `db-setup` (профиль `setup`) оставить как есть.

### 1.5 Acceptance
- Образ runtime ~300–500 МБ (вместо ~1.5–2 ГБ).
- Один процесс Node вместо двух → ~250–400 МБ RSS.
- `docker compose up` запускает только `postgres` + `web`.

### 1.6 Связи
- T5 (`ensureDatabaseSchema` один раз) использует тот же `instrumentation.register()`.
- При рестарте `web` долгие backfill'ы переживают за счёт `IngestionCheckpoint`.

---

## TASK 2 — Динамический импорт `exceljs`

Цель: `exceljs` (23 МБ) не попадает в bundle маршрутов, не работающих с Excel.

### 2.1 Файлы со статическим импортом
- `src/lib/importers/excel-workbook.ts`
- `src/machete/fantasy_price_sheet_import.ts`
- `src/app/api/machete/fantasy-prices/import-sheet/route.ts`
- Тестовые `*.test.ts` — оставить статический импорт, на runtime не влияет.

### 2.2 Шаблон замены
```ts
import type ExcelJS from "exceljs";  // только типы — runtime-стоимость 0

async function parseWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSLib } = await import("exceljs");
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
```

### 2.3 Шаги
1. В `excel-workbook.ts` заменить все импорты `exceljs` на `import type` + локальный `await import` внутри функций.
2. То же в `fantasy_price_sheet_import.ts`.
3. То же в роуте `import-sheet/route.ts`.
4. `npm run build` → проверить, что `exceljs` оказался только в чанке маршрута импорта.

### 2.4 Связь с T1
Динамический импорт усиливает выигрыш `output:"standalone"`: `exceljs` не попадает в стартовый граф зависимостей.

---

## TASK 3 — Уничтожение JSON-дубликатов + немедленное удаление `RawMatchPayload` после `isFinal=true`

Самая большая задача — переработка схемы БД и пайплайна ингестии.

### 3.1 Принцип
Сырые payload'ы хранятся только для одной цели: возможность распарсить незавершённый матч заново, когда он завершится. После `isFinal=true` сырое не нужно — есть нормализованные таблицы. Все «дубль»-поля JSON в дочерних таблицах вырезаются.

### 3.2 Инвентаризация JSON-колонок
Перед удалением — обязательный аудит, потому что некоторые поля читаются в скоринге/UI.

```bash
grep -rn "statsPayload" src/
grep -rn "eventPayload" src/
grep -rn "rawMetrics" src/
grep -rn "rosterPayload" src/
grep -rn "\.raw\b" src/
```

Классификация (заполняется по результатам грепа):

| Поле | Если не читается | Если читается |
|---|---|---|
| `RawMatchPayload.payload` | удалить сразу после `isFinal=true` (см. 3.3) | поднять нужные поля в нормализованные колонки → удалить |
| `MatchTeamStat.statsPayload` | drop column | вынести метрики в типизированные колонки |
| `MatchPlayerStat.statsPayload` | drop column | то же |
| `MatchEvent.eventPayload` | drop column | то же |
| `MacheteFixture.raw` | drop | то же |
| `MachetePlayer.raw` | drop | то же |
| `MachetePlayerMatchStat.raw` | drop | то же |
| `BaltikaFixture.raw` | drop | то же |
| `BaltikaTeamMatchStat.raw` | drop | то же |
| `TeamPlayerSeason.rosterPayload` | drop | то же |
| `PlayerSnapshot.rawMetrics` | drop | вероятно читается формулами скоринга — см. 3.5 |

### 3.3 Изменение пайплайна ингестии
В `src/core_data/raw_payload_store.ts`:
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

В `src/core_data/ingestion.ts` при финализации матча:
```ts
await prisma.$transaction(async (tx) => {
  await persistNormalizedRows(tx, parsed);
  if (isFinal) {
    await tx.rawMatchPayload.delete({ where: { matchId } }).catch(() => null);
  }
});
```

Логика «парсим → пишем normalized → удаляем raw» в одной транзакции — гарантия, что либо есть raw (можно перепарсить), либо есть normalized (raw уже не нужен).

### 3.4 Скрипт `ingestion:reparse-raw`
Будет работать только для незавершённых матчей. В коде команды — понятная ошибка для финализированных матчей: «match X is finalized, raw payload is not stored anymore — use initial-backfill to re-fetch». Сменa `parserVersion` теперь требует fetch заново, не reparse — сознательный размен за экономию диска.

### 3.5 Миграция Prisma (`db push` + `db:safe-update`)
1. **Аудит-стадия** (ручная): пройти по таблице 3.2, для каждой колонки решить — drop или promote.
2. **Promote**: для колонок, поля которых читаются, добавить типизированные колонки.
3. **Backfill-скрипт** `scripts/migrate-strip-json-payloads.ts`: батчами по 1000, идемпотентен, поддерживает dry-run.
4. **Schema change**: удалить JSON-колонки в `schema.prisma`. Запустить `npm run db:safe-update`.
5. **Очистка `raw_match_payloads`**:
   ```sql
   DELETE FROM raw_match_payloads
   WHERE EXISTS (SELECT 1 FROM matches m WHERE m.id = raw_match_payloads.match_id AND m.finished = true);
   ```
   В скрипте `scripts/prune-finalized-raw-payloads.ts`.

### 3.6 Acceptance
- Размер БД до/после: ожидаемое сокращение в 5–20× для `matches`, `match_*`, `raw_match_payloads`.
- Все тесты в `src/core_data/*.test.ts` и `src/scoring/*.test.ts` зелёные.
- Парсер идемпотентен на повторных вызовах.

### 3.7 Связь с T4
T4 применяет тот же приём к `MacheteRawPayload`. Делать в одном PR с T3.

---

## TASK 4 — Ретеншн `MacheteRawPayload` (тот же приём, что T3)

### 4.1 Принцип
`MacheteRawPayload` — сырые ответы Machete-провайдера на лиги/команды/игроков. Сейчас живёт вечно. Применяем логику T3.

### 4.2 Шаги
1. Найти точки записи: `grep -rn "macheteRawPayload" src/` (вероятно `src/providers/fotmob/client.ts` или `src/core_data/parsers/machete/`).
2. После успешного парсинга и записи нормализованных строк (`MacheteLeague`, `MacheteTeam`, `MachetePlayer`, `MacheteFixture`, `MachetePlayerMatchStat`) — удалить соответствующую `MacheteRawPayload` в той же транзакции.
3. Если для конкретного `entityType` нужен audit-trail (например, fixture ещё не сыгран), оставить запись и добавить колонку `expiresAt` (по аналогии с `ShotmapComparisonsCache`), TTL 7 дней. Чистка — в `startLeagueSeasonRetentionScheduler`.
4. Скрипт одноразовой очистки: `scripts/prune-machete-raw-payloads.ts`.

### 4.3 Связь с T1
В `instrumentation.ts` уже стартует retention-шедулер — туда добавить обход MacheteRawPayload.

---

## TASK 5 — `ensureDatabaseSchema` вызывается один раз при старте

### 5.1 Сейчас
В `src/app/layout.tsx:37` `await ensureDatabaseSchema()` вызывается на каждом SSR-рендере.

### 5.2 Изменения
1. В `src/instrumentation.ts` внутри `register()` — самым первым шагом:
   ```ts
   const { ensureDatabaseSchema } = await import("@/lib/db");
   await ensureDatabaseSchema();
   ```
2. Из `src/app/layout.tsx` убрать вызов `ensureDatabaseSchema()`.
3. Проверить идемпотентность `ensureDatabaseSchema` (по названию — да, но убедиться).

### 5.3 Связь с T1
Финальный порядок в `instrumentation.register()`:
```ts
await ensureDatabaseSchema();              // T5
startMacheteDailyFotMobSyncScheduler();    // existing
startLeagueSeasonRetentionScheduler();     // existing
startIngestionWorkerLoop();                // T1
```
`ensureDatabaseSchema` обязан быть первым и `await` — шедулеры полагаются на готовую схему.

---

## TASK 6 — Адаптивные интервалы polling в UI

### 6.1 Точки правки
- `src/components/admin/IngestionAutoRefresh.tsx`
- `src/components/machete/MacheteSyncStatusBanner.tsx`
- `src/components/baltika/baltika-calendar-panel.tsx` (проверить — UX-таймер или polling)
- `src/components/players/player-watchlist.tsx` (проверить)

Для каждого: найти `setInterval(..., N)` или `useEffect` с интервалом, определить роль («реалтайм статус» или «UX-таймер»).

### 6.2 Общий хук `src/lib/use-adaptive-poll.ts`
```ts
export function useAdaptivePoll<T>(fetcher: () => Promise<T>, options: {
  activeIntervalMs: number;   // 10000 — когда что-то идёт (sync running)
  idleIntervalMs: number;     // 60000 — когда стабильно idle
  initialIntervalMs: number;  // 5000  — после действий пользователя
  isActive: (data: T) => boolean;
}): T | null
```
Логика:
- стартуем с `initialIntervalMs`;
- если `isActive(data) === true` — интервал = `activeIntervalMs`;
- если 3 фетча подряд состояние не меняется — backoff к `idleIntervalMs`;
- при unmount — clear timer.

### 6.3 Применение
- `IngestionAutoRefresh`: `active=10s`, `idle=60s`, `initial=5s` — `isActive = job.status === 'running'`.
- `MacheteSyncStatusBanner`: `active=15s`, `idle=120s`.
- UX-таймеры (тосты «скопировано», submit-cooldown) не трогать.

### 6.4 Связь
Не зависит от T1–T5, можно делать отдельным PR.

---

## TASK 7 — Очистка локальных временных файлов

### 7.1 Цель
Не оставлять на диске разработчика ~75 МБ мусора (`tmp_47_match_details.rds`, `tmp_fotmob_smoke/`, `sports_ru_*_backup_*.json`). Они уже в `.gitignore` — вопрос гигиенический.

### 7.2 Шаги
1. Удалить файлы единократно:
   ```powershell
   Remove-Item -Recurse -Force tmp_47_match_details.rds, tmp_fotmob_smoke, sports_ru_*_backup_*.json -ErrorAction SilentlyContinue
   ```
2. Добавить в `package.json` npm-скрипт `clean:dev`, который удаляет `tmp_*`, `.next`, `tsconfig.tsbuildinfo`, `sports_ru_*_backup_*.json`.
3. Скрипты типа `fotmob:smoke`, которые создают эти файлы, дополнить параметром `--out-dir` — по умолчанию писать в `os.tmpdir()`, а не в корень репо.

### 7.3 Связь
Не зависит. Самостоятельный PR.

---

## Рекомендованный порядок мерджа

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

PR-A и PR-D можно мерджить параллельно. PR-B независим от PR-C по коду, но имеет смысл сначала PR-B, чтобы prod уже работал на одном процессе к моменту миграции БД.

---

## Что не изменяется

- Внешний API роутов остаётся прежним (no breaking changes).
- Команды CLI `scripts/ingestion-runner.ts` сохраняются для dev/ops.
- Шедулеры (`MACHETE_DAILY_SYNC_*`, `LEAGUE_SEASON_RETENTION_*`) сохраняют env-флаги; меняется только место запуска.
- Prisma остаётся, миграции — через `prisma db push` + `db:safe-update`.
- Никаких сторонних сервисов (S3, Redis, очереди) не добавляется.
