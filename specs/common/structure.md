<a name="root"></a>

# Technical map {#root}

## Betting league
`src/betting/`, `src/app/betting/`, `src/app/api/betting/` - line, algorithms and accounting of the virtual league. Namespace: `spec://modules/betting/FEAT-001-virtual-league#root`. The worker cycle is connected via instrumentation; tables have the betting_ prefix.

## Franchise analytics
`src/franchises/`, `src/server/franchises/`, `src/app/franchises/`, `src/app/api/franchises/`, `scripts/franchise-analytics/` — подготовка снимка, алгоритмическая агрегация по дистанции, общий UI и xФО. Namespace: `spec://modules/franchises/FEAT-005-franchise-analytics#root`. Независим от ограничений франшизы Machete; использует общий session auth и статистику core_data.

## Sports trends и Telegram deadline

Sports.ru club limits and cached Squad rule reads: `src/machete/sports_ru_team_limits.ts`, `src/machete/squad_planner.ts`; ownership `spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits`. Import defaults and current-season contest migrations share the explicit league-ID matrix.

Contracts: `spec://modules/machete/FEAT-006-sports-popularity#root`, `spec://modules/telegram/FEAT-007-deadline-assistant#root`, `spec://modules/telegram/INFRA-005-deadline-pipeline#root`. Ownership: `src/providers/sports-ru-trends/` (feed/article HTTP и parser), `src/server/sports-trends/` (collector, ownership snapshots, scheduler), `src/machete/sports-trends.ts` (read view), `src/server/telegram/` (link service, webhook, bot API, rate limits), `src/server/deadline-reports/` (campaign planning, classifier, renderer, delivery) и `src/app/api/telegram/webhook/`. Флаги `SPORTS_TRENDS_SYNC_ENABLED`, `TELEGRAM_LINK_ENABLED`, `TELEGRAM_DEADLINE_ENABLED`, `TELEGRAM_SEND_ENABLED`, `TELEGRAM_PAID_BROADCAST_ENABLED` по умолчанию off. Existing Sports price/squad import, Sorare, scoring and session auth retain their ownership. See `docs/TELEGRAM_DEADLINE_PLAN.md`.

## Runtime

- Next.js App Router, React, TypeScript (`src/app`, `next.config.mjs`).
- Prisma Client and versioned SQL migrations (`prisma/schema.prisma`, `prisma/migrations`).
- PostgreSQL locally via Docker Compose on host port `5433` (`docker-compose.yml`, `docs/development/LOCAL_DEVELOPMENT.md`).
- Tailwind CSS for application pages.
- Node test runner through `tsx --test`; Playwright for e2e.
- Production packaging through Docker and the scripts in `docs/operations/DEPLOYMENT.md` / `docs/operations/DOCKER_PRODUCTION.md`.
- Hourly full Squad pool refreshes use the bundled `scripts/refresh-fantasy-player-pool-snapshots.ts` child process. The existing scheduler holds its full/incremental exclusion until child exit; a stopped parent terminates the child. Atomic READY publication and the prior ready revision on failure are preserved. Child exit releases native database/allocator memory; incremental queue polling stays in the worker.

## Modules and code ownership

| Area | Responsibility | Primary code |
|---|---|---|
| Spec workflow tooling | PROP-001: explicit standalone/managed mode validation, mirrored client skills and contract fixtures | `.agents/skills/spec-driven-work/scripts/check-workflow.mjs`, `.claude/skills/spec-driven-work/scripts/check-workflow.mjs`, `src/lib/workflow-validator.test.ts` |
| Machete UI | League, player, model, squad, and sync screens | `src/app/machete` |
| Squad player card | FEAT-003: contact-sheet pitch/bench card and themed styles | `src/components/machete/FantasySquadPlanner.tsx`, `src/app/globals.css` |
| Machete domain | Read models, scoring, Sports.ru mapping, squad planning | `src/machete` |
| Platform transfer trends | FEAT-008: bounded readers of saved plans vs published round squads; aggregate API and shared football/KHL panel | `src/machete/platform-transfer-trends.ts`, `src/server/platform-transfer-trends.ts`, `src/app/api/machete/platform-transfers/`, `src/components/machete/PlatformTransferTrendsPanel.tsx` |
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
| Sports trends | FEAT-006: лента/статьи Sports, до 15 игроков, ownership и дельта | `src/providers/sports-ru-trends/`, `src/server/sports-trends/`, `src/machete/sports-trends.ts` |
| Telegram linking | FEAT-007: link session, код 15 секунд, webhook, подписки | `src/server/telegram/`, `src/app/api/profile/telegram/`, `src/app/api/telegram/webhook/` |
| Deadline reports | INFRA-005: кампании 08:00/08:10/09:00, классификация, рендер, outbox | `src/server/deadline-reports/`, `scripts/deadline-reports.ts` |
| Browser extension | Sports.ru squad transfer | `extensions/sports-squad-transfer` |
| Schema | Canonical datamodel and migrations | `prisma` |

## Namespaces

- UI routes live under `src/app/<mode>` and `src/app/admin`.
- Domain logic stays out of route files: Machete in `src/machete`, Baltika in `src/server/baltika`, shared provider tables in `src/core_data`.
- Cron routes under `src/app/api/cron` are protected by `CRON_SECRET`.

## Checks

`npm run check` runs version verification, tests, lint, typecheck, and production build in sequence because Next type generation and `.next` writes must not race.

## KHL

Isolated `src/khl/`, `src/server/khl/`, `src/components/khl/`, `src/app/machete/khl/`, `src/app/api/machete/khl/` and tables `khl_*`. Adapters: `src/providers/sports-ru-hockey/`, `khl-mobile/`, `khl-xg/`, `fonbet/hockey-*`. Contracts in `specs/modules/khl/` (FEAT-001/002/003, INFRA-001/002/003). Football core_data and scoring remain independent. KHL flags are turned off until production readiness.

Матчевые протоколы КХЛ: одноразовый HTTP `scripts/khl-protocol-http.py` (зависимости `khl-http-requirements.txt`, без браузера), серверный таймер `ops/fantasy-khl-statistics.*` → `src/providers/khl-mobile/protocol*.ts` → `src/server/khl/protocol-import.ts`/`protocol-scheduler.ts` → агрегаты в `read-model.ts`. Базовый семидневный EP: `rolling-forecast.ts`; owning contracts INFRA-001#protocols, INFRA-002#protocol-aggregates, FEAT-003#rolling-beta.

Sports fantasy weeks: `src/khl/fantasy-calendar.ts` resolves agreeing club observations; `src/server/khl/fantasy-calendar.ts` fetches bounded club calendars and atomically corrects assignments in the existing hourly cycle. Ownership: INFRA-001#fantasy-weeks; verified boundaries and readiness gates remain independent.

Идентичность КХЛ: `sports-ru-hockey/identity.ts`, `khl-mobile/identity.ts`, `server/khl/identity-sync.ts` и проверенный операторский `identity-audit.ts`; клубные травмы `khl-mobile/injuries.ts` → `server/khl/injury-sync.ts`. Тот же ограниченный HTTP helper и часовой цикл, ownership INFRA-001#normalization/#runtime.

<a name="release-transport"></a>

## Release transport {#release-transport}

Continuous rollout ownership: `spec://common/INFRA-006-continuous-deployment#root`, `scripts/deploy-production-docker.sh`, `scripts/production-web-routing.py`, `scripts/check-online-migrations.py` and the production relay adapter. Keep the serving web running until a verified candidate on the alternate loopback port receives traffic through a validated graceful Caddy reload. Builds, backups and migration rehearsals run without stopping the serving website.

The immutable GitHub production promoter keeps its SSH channel alive every 15 seconds and terminates an unresponsive channel after four unanswered probes. Authentication, host verification, release ancestry/checksums and automatic rollback remain mandatory. Docker dependency downloads use a 60-second request timeout, three retries, and bounded 1–10 second retry delays; a failed download stops the candidate without replacing production. A disconnected promotion is inspected before retrying so that collectors, canaries and release processes are never duplicated.

<a name="documentation"></a>

## Documentation ownership {#documentation}

Public documentation prose is English. Preserve executable examples, identifiers,
formulas, exact UI labels, provider fixtures, and raw verification evidence when
their original spelling is part of the contract or source data.

The root README introduces the current product. `docs/README.md` indexes product,
development, reference, integrations, guides, operations, testing, research,
design concepts, and an explicit archive. Former `product/`, `prompts/`, and
`implementation-notes/` documents are grouped under `docs/`. Historical MVP
prompts and planning inputs live in `docs/archive/`.

Canonical specification paths stay in `specs/common/` and `specs/modules/`;
relocating other documentation must preserve `spec://` addresses, contract
anchors, code ownership, and relative navigation. The `.agents/` and `.claude/`
workflow copies are intentional matching client entry points.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-10-09: WI-060 — own the continuous production rollout, isolated Caddy upstream switch and compatible migration guard.

- 2026-10-04: WI-046 — isolate the hourly full Squad refresh while preserving scheduler serialization and atomic READY publication.

- 2026-09-28: WI-042 — keep long release SSH channels alive and bound Docker package fetch retries after a disconnected KHL status release attempt.

- 2026-09-28: English documentation and topic-based document ownership; local
  artifacts and credentials excluded from Git (WI-039).
