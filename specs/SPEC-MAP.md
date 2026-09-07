# Specification map

Canon for Fantasy Scout. Work status lives in `BOARD.md`; this file is the catalog of specifications. The repository is standalone: agents follow `AGENTS.md` and do not wait for a Prist connection.

## Current canon

| Document | Responsibility |
|---|---|
| `specs/modules/betting/FEAT-001-virtual-league.md` | Active: виртуальная лига, линия, монеты, алгоритмы и расчёт |
| `specs/common/main.md` | Product purpose, audience, modes, and boundaries |
| `specs/common/structure.md` | Runtime, modules, namespaces, and code ownership |
| `specs/modules/machete/FEAT-001-global-ranking-strategy.md` | Active: режим «По глобальному рейтингу» в планировщике |
| `specs/modules/machete/FEAT-002-global-strategy-formula.md` | Active: формула K и strategyScore |
| `specs/modules/machete/FEAT-003-squad-player-card.md` | Active: карточка поля Squad «Контактный лист», действия и темы |
| `specs/modules/machete/FEAT-004-rotation-risk.md` | Active: RR по истории стартов и отдыху, надёжный подбор |

Typed specs were imported from today's documents in `docs/`. Originals stay in place.

## Existing product documents

These files stay as authored project documentation. They are not typed Prist specifications and were not rewritten during adoption.

| Document | Use |
|---|---|
| `product/PRODUCT_BRIEF.md` | Product reality, personas, in/out of scope |
| `README.md` | Stack, local run, useful routes, checks |
| `docs/ARCHITECTURE.md` | Modes, module map, data flows |
| `docs/DATA_MODEL.md` | Prisma model groups |
| `docs/API_ROUTES.md` | HTTP routes |
| `docs/LOCAL_DEVELOPMENT.md` | Local Postgres and app startup |
| `docs/DEPLOYMENT.md` | Production deploy |
| `docs/DOCKER_PRODUCTION.md` | Container runtime |
| `docs/FANTASY_SCORING.md` | Scoring behaviour |
| `docs/MACHETE_FOTMOB_IMPORT.md` | FotMob ingestion |
| `docs/SPORTS_RU_FANTASY_SYNC.md` | Sports.ru prices |
| `docs/GLOBAL_STRATEGY_SPEC.md` | Source for FEAT-001, 2026-09-06 |
| `docs/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md` | Source for FEAT-002, 2026-09-06 |
| `docs/KHL_FANTASY_FEASIBILITY_2026-09-06.md` | Research report, not a typed product spec yet |

## Next typed specs

Register a PROP, FEAT, or INFRA only when a change needs an independently owned contract. Likely first areas: Machete squad planning, FotMob ingestion, Sports.ru price mapping, Baltika workbook import, MiXerr shot maps, and auth/session access.
