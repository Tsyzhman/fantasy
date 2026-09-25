# Specification map

Canon for Fantasy Scout. Work status lives in `BOARD.md`; this file is the catalog of specifications. The repository is standalone: agents follow `AGENTS.md` and do not wait for a Prist connection.

## Current canon

|---|---|
| `specs/modules/franchises/FEAT-005-franchise-analytics.md` | Active: РѕС‚РґРµР»СЊРЅР°СЏ Р°РЅР°Р»РёС‚РёРєР° С„СЂР°РЅС€РёР·, РґРёР°РїР°Р·РѕРЅ С‚СѓСЂРѕРІ, Р·Р°РјРѕСЂРѕР·РєРё Рё xР¤Рћ |
| `specs/modules/machete/INFRA-004-sorareinside-starters.md` | Active: РѕСЃРЅРѕРІР° SorareInside, Р±Р»РёР¶Р°Р№С€РёР№ РјР°С‚С‡, UUID-РјР°РїРїРёРЅРі, Р·Р°РїСѓСЃРє :05 |
| `specs/modules/betting/FEAT-001-virtual-league.md` | Active: РІРёСЂС‚СѓР°Р»СЊРЅР°СЏ Р»РёРіР°, Р»РёРЅРёСЏ, РјРѕРЅРµС‚С‹, Р°Р»РіРѕСЂРёС‚РјС‹ Рё СЂР°СЃС‡С‘С‚ |
| `specs/common/main.md` | Product purpose, audience, modes, and boundaries |
| `specs/common/structure.md` | Runtime, modules, namespaces, and code ownership |
| `specs/modules/machete/FEAT-001-global-ranking-strategy.md` | Active: СЂРµР¶РёРј В«РџРѕ РіР»РѕР±Р°Р»СЊРЅРѕРјСѓ СЂРµР№С‚РёРЅРіСѓВ» РІ РїР»Р°РЅРёСЂРѕРІС‰РёРєРµ |
| `specs/modules/machete/FEAT-002-global-strategy-formula.md` | Active: С„РѕСЂРјСѓР»Р° K Рё strategyScore |
| `specs/modules/machete/FEAT-003-squad-player-card.md` | Active: РєР°СЂС‚РѕС‡РєР° РїРѕР»СЏ Squad В«РљРѕРЅС‚Р°РєС‚РЅС‹Р№ Р»РёСЃС‚В», РґРµР№СЃС‚РІРёСЏ Рё С‚РµРјС‹ |
| `specs/modules/machete/FEAT-004-rotation-risk.md` | Active: RR РїРѕ РёСЃС‚РѕСЂРёРё СЃС‚Р°СЂС‚РѕРІ Рё РѕС‚РґС‹С…Сѓ, РЅР°РґС‘Р¶РЅС‹Р№ РїРѕРґР±РѕСЂ |
| `specs/modules/machete/FEAT-006-sports-popularity.md` | Active: РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Рµ СЂРµР№С‚РёРЅРіРё Sports, РґРѕ 15 РёРіСЂРѕРєРѕРІ, ownership Рё РїРѕРєСѓРїРєРё РєР°Рє СЂР°Р·РЅС‹Рµ РјРµС‚СЂРёРєРё |
| `specs/modules/telegram/FEAT-007-deadline-assistant.md` | Active: РїСЂРёРІСЏР·РєР° Telegram, РєРѕРґ 15 СЃРµРєСѓРЅРґ, РїРѕРґРїРёСЃРєРё Рё РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РѕС‚С‡С‘С‚ РїРѕ РґРµРґР»Р°Р№РЅСѓ |
| `specs/modules/telegram/INFRA-005-deadline-pipeline.md` | Active: 08:00/08:10/09:00 РњРЎРљ, РѕР±С‰РёРµ РѕР±РЅРѕРІР»РµРЅРёСЏ, РѕС‡РµСЂРµРґРё, freshness, capacity Рё delivery |

## РўРёРїРёР·РёСЂРѕРІР°РЅРЅС‹Рµ СЃРїРµРєРё

Typed specs were imported from earlier documents in `docs/`. Originals stay in place.

## Р РµР°Р»РёР·Р°С†РёСЏ Sports trends Рё Telegram

РџРµСЂРІС‹Р№ РІС‹РїСѓСЃРє FEAT-006, FEAT-007 Рё INFRA-005 СЂРµР°Р»РёР·РѕРІР°РЅ Рё РІС‹РїСѓСЃРєР°РµС‚СЃСЏ РїРѕРґ С„Р»Р°РіР°РјРё РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ off; РѕР±Р·РѕСЂ Рё РїСЂРѕРІРµСЂРµРЅРЅС‹Рµ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ: [Telegram deadline plan](../docs/TELEGRAM_DEADLINE_PLAN.md).

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

## Draft proposals

Нет открытых draft: FEAT-006, FEAT-007 и INFRA-005 переведены в active.

## Future typed areas

Register a PROP, FEAT, or INFRA only when a change needs an independently owned contract. Likely first areas: Machete squad planning, FotMob ingestion, Sports.ru price mapping, Baltika workbook import, MiXerr shot maps, and auth/session access.

## KHL (РёР·РѕР»РёСЂРѕРІР°РЅРЅС‹Р№ beta-РјРѕРґСѓР»СЊ)

- `specs/modules/khl/FEAT-001-khl-module-and-rules.md`
- `specs/modules/khl/FEAT-002-khl-squad.md` вЂ” active; РѕС‚РґРµР»СЊРЅС‹Рµ readiness gates СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ
- `specs/modules/khl/FEAT-003-khl-projections-and-optimizer.md` вЂ” active; РѕС‚РґРµР»СЊРЅС‹Рµ readiness gates СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ
- `specs/modules/khl/INFRA-001-khl-data-ingestion.md` вЂ” active; РѕС‚РґРµР»СЊРЅС‹Рµ readiness gates СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ
- `specs/modules/khl/INFRA-002-khl-storage-and-api.md` вЂ” active; РѕС‚РґРµР»СЊРЅС‹Рµ readiness gates СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ
- `specs/modules/khl/INFRA-003-khl-fonbet-odds.md`

Р РµР°Р»РёР·Р°С†РёСЏ Рё production gates: [KHL status](../docs/KHL_IMPLEMENTATION_STATUS.md).
