# Technical map

## Betting league
`src/betting/`, `src/app/betting/`, `src/app/api/betting/` — линия, алгоритмы и бухгалтерия виртуальной лиги. Namespace: `spec://modules/betting/FEAT-001-virtual-league#root`. Цикл worker подключён через instrumentation; таблицы имеют префикс betting_.

## Runtime

- Next.js App Router, React, TypeScript (`src/app`, `next.config.mjs`).
- Prisma Client and versioned SQL migrations (`prisma/schema.prisma`, `prisma/migrations`).
- PostgreSQL locally via Docker Compose on host port `5433` (`docker-compose.yml`, `docs/LOCAL_DEVELOPMENT.md`).
- Tailwind CSS for application pages.
- Node test runner through `tsx --test`; Playwright for e2e.
- Production packaging through Docker and the scripts in `docs/DEPLOYMENT.md` / `docs/DOCKER_PRODUCTION.md`.

## Modules and code ownership

| Area | Responsibility | Primary code |
|---|---|---|
| Machete UI | League, player, model, squad, and sync screens | `src/app/machete` |
| Squad player card | FEAT-003: contact-sheet pitch/bench card and themed styles | `src/components/machete/FantasySquadPlanner.tsx`, `src/app/globals.css` |
| Machete domain | Read models, scoring, Sports.ru mapping, squad planning | `src/machete` |
| Rotation risk | FEAT-004: RR math and bounded normalized history reader | `src/machete/rotation-risk.ts`, `src/server/rotation-risk.ts` |
| Global ranking strategy | FEAT-001/002: pure K/EP-loss math, bounded candidate search, provider context/cache, recommendation audit and UI | `src/machete/global-strategy*.ts`, `src/server/global-strategy*.ts`, `src/app/api/machete/squads/global-strategy`, `src/components/machete/GlobalStrategyPanel.tsx` |
| Shared FotMob core | Normalized match, team, player, shot, and event tables | `src/core_data` |
| Baltika UI | Imported leagues, teams, schedule, models | `src/app/baltika` |
| Baltika domain | Wyscout-style workbook and fixture/team-stat import | `src/server/baltika` |
| MiXerr | Shot-map explorer and comparison UI | `src/app/mixerr` |
| Admin | Users, leagues, ingestion controls, franchise squads | `src/app/admin` |
| HTTP API | Auth, imports, ingestion, squads, shot maps, cron | `src/app/api` |
| Auth and shared lib | Sessions, Prisma client, request parsing, helpers | `src/lib` |
| Ingestion jobs | Backfill, incremental update, worker loop | `scripts/ingestion-runner.ts`, `src/app/api/admin/ingestion` |
| SorareInside starters | INFRA-004: ближайший матч, UUID-маппинг и hourly :05 | `src/providers/sorareinside/`, `src/machete/sorareinside-sync.ts`, `src/server/sorareinside-scheduler.ts`, `scripts/sync-sorareinside.ts` |
| Browser extension | Sports.ru squad transfer | `extensions/sports-squad-transfer` |
| Schema | Canonical datamodel and migrations | `prisma` |

## Namespaces

- UI routes live under `src/app/<mode>` and `src/app/admin`.
- Domain logic stays out of route files: Machete in `src/machete`, Baltika in `src/server/baltika`, shared provider tables in `src/core_data`.
- Cron routes under `src/app/api/cron` are protected by `CRON_SECRET`.

## Checks

`npm run check` runs version verification, tests, lint, typecheck, and production build in sequence because Next type generation and `.next` writes must not race.

## KHL

Изолированные `src/khl/`, `src/server/khl/`, `src/components/khl/`, `src/app/machete/khl/`, `src/app/api/machete/khl/` и таблицы `khl_*`. Адаптеры: `src/providers/sports-ru-hockey/`, `khl-mobile/`, `khl-xg/`, `fonbet/hockey-*`. Контракты в `specs/modules/khl/` (FEAT-001/002/003, INFRA-001/002/003). Футбольные core_data и scoring остаются независимыми. Флаги КХЛ выключены до production readiness.

Матчевые протоколы КХЛ: одноразовый HTTP `scripts/khl-protocol-http.py` (зависимости `khl-http-requirements.txt`, без браузера), серверный таймер `ops/fantasy-khl-statistics.*` → `src/providers/khl-mobile/protocol*.ts` → `src/server/khl/protocol-import.ts`/`protocol-scheduler.ts` → агрегаты в `read-model.ts`. Базовый семидневный EP: `rolling-forecast.ts`; owning contracts INFRA-001#protocols, INFRA-002#protocol-aggregates, FEAT-003#rolling-beta.

Идентичность КХЛ: `sports-ru-hockey/identity.ts`, `khl-mobile/identity.ts`, `server/khl/identity-sync.ts` и проверенный операторский `identity-audit.ts`; клубные травмы `khl-mobile/injuries.ts` → `server/khl/injury-sync.ts`. Тот же ограниченный HTTP helper и часовой цикл, ownership INFRA-001#normalization/#runtime.
