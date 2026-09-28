# Specification map

Canon for Fantasy Scout. Work status lives in `BOARD.md`; this file is the catalog of specifications. The repository is standalone: agents follow `AGENTS.md` and do not wait for a Prist connection.

## Current canon

| Document | Responsibility |
|---|---|
| [specs/modules/franchises/FEAT-005-franchise-analytics.md](modules/franchises/FEAT-005-franchise-analytics.md) | Active: franchise analytics, round ranges, freezes and xFP |
| [specs/modules/machete/FEAT-006-sports-popularity.md](modules/machete/FEAT-006-sports-popularity.md) | Active: Sports popularity ratings, ownership and transfers |
| [specs/modules/telegram/FEAT-007-deadline-assistant.md](modules/telegram/FEAT-007-deadline-assistant.md) | Active: Telegram linking, subscriptions and deadline reports |
| [specs/modules/telegram/INFRA-005-deadline-pipeline.md](modules/telegram/INFRA-005-deadline-pipeline.md) | Active: deadline campaigns, freshness and delivery |
| [specs/modules/machete/INFRA-004-sorareinside-starters.md](modules/machete/INFRA-004-sorareinside-starters.md) | Active: SorareInside starters, nearest future match, UUID mapping, hourly refresh at :05 |
| [specs/modules/betting/FEAT-001-virtual-league.md](modules/betting/FEAT-001-virtual-league.md) | Active: virtual league, line, coins, algorithms and calculation |
| [specs/common/main.md](common/main.md) | Product purpose, audience, modes, and boundaries |
| [specs/common/structure.md](common/structure.md) | Runtime, modules, namespaces, and code ownership |
| [specs/modules/machete/FEAT-001-global-ranking-strategy.md](modules/machete/FEAT-001-global-ranking-strategy.md) | Active: global-ranking mode in the squad planner |
| [specs/modules/machete/FEAT-002-global-strategy-formula.md](modules/machete/FEAT-002-global-strategy-formula.md) | Active: formula K and strategyScore |
| [specs/modules/machete/FEAT-003-squad-player-card.md](modules/machete/FEAT-003-squad-player-card.md) | Active: Squad field card “Contact sheet”, actions and themes |
| [specs/modules/machete/FEAT-004-rotation-risk.md](modules/machete/FEAT-004-rotation-risk.md) | Active: RR on the history of starts and rests, reliable selection |

Typed specifications were imported from the original project documents. Historical inputs remain in `docs/archive/planning/`; current navigation starts at `docs/README.md`.

## Existing product documents

These files stay as authored project documentation. They are not typed Prist specifications and were not rewritten during adoption.

| Document | Use |
|---|---|
| [docs/product/PRODUCT_BRIEF.md](../docs/product/PRODUCT_BRIEF.md) | Product reality, personas, in/out of scope |
| [README.md](../README.md) | Stack, local run, useful routes, checks |
| [docs/reference/ARCHITECTURE.md](../docs/reference/ARCHITECTURE.md) | Modes, module map, data flows |
| [docs/reference/DATA_MODEL.md](../docs/reference/DATA_MODEL.md) | Prisma model groups |
| [docs/reference/API_ROUTES.md](../docs/reference/API_ROUTES.md) | HTTP routes |
| [docs/development/LOCAL_DEVELOPMENT.md](../docs/development/LOCAL_DEVELOPMENT.md) | Local Postgres and app startup |
| [docs/operations/DEPLOYMENT.md](../docs/operations/DEPLOYMENT.md) | Production deploy |
| [docs/operations/DOCKER_PRODUCTION.md](../docs/operations/DOCKER_PRODUCTION.md) | Container runtime |
| [docs/reference/FANTASY_SCORING.md](../docs/reference/FANTASY_SCORING.md) | Scoring behaviour |
| [docs/integrations/MACHETE_FOTMOB_IMPORT.md](../docs/integrations/MACHETE_FOTMOB_IMPORT.md) | FotMob ingestion |
| [docs/integrations/SPORTS_RU_FANTASY_SYNC.md](../docs/integrations/SPORTS_RU_FANTASY_SYNC.md) | Sports.ru prices |
| [docs/archive/planning/GLOBAL_STRATEGY_SPEC.md](../docs/archive/planning/GLOBAL_STRATEGY_SPEC.md) | Source for FEAT-001, 2026-09-06 |
| [docs/archive/planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md](../docs/archive/planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md) | Source for FEAT-002, 2026-09-06 |
| [docs/research/KHL_FANTASY_FEASIBILITY_2026-09-06.md](../docs/research/KHL_FANTASY_FEASIBILITY_2026-09-06.md) | Research report, not a typed product spec yet |

## Next typed specs

Register a PROP, FEAT, or INFRA only when a change needs an independently owned contract. Likely first areas: Machete squad planning, FotMob ingestion, Sports.ru price mapping, Baltika workbook import, MiXerr shot maps, and auth/session access.

## KHL (isolated beta module)

- [FEAT-001-khl-module-and-rules.md](modules/khl/FEAT-001-khl-module-and-rules.md)
- [FEAT-002-khl-squad.md](modules/khl/FEAT-002-khl-squad.md) - active; separate readiness gates are preserved
- [FEAT-003-khl-projections-and-optimizer.md](modules/khl/FEAT-003-khl-projections-and-optimizer.md) - active; separate readiness gates are preserved
- [INFRA-001-khl-data-ingestion.md](modules/khl/INFRA-001-khl-data-ingestion.md) - active; separate readiness gates are preserved
- [INFRA-002-khl-storage-and-api.md](modules/khl/INFRA-002-khl-storage-and-api.md) - active; separate readiness gates are preserved
- [INFRA-003-khl-fonbet-odds.md](modules/khl/INFRA-003-khl-fonbet-odds.md)

Implementation and production gates: [KHL status](../docs/guides/KHL_IMPLEMENTATION_STATUS.md).
