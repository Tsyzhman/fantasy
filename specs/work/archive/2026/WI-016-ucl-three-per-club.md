# WI-016 — Три игрока одного клуба в ЛЧ

Kind: fix
Canon action: none

## Outcome
В Squad ЛЧ можно выбрать до3 игроков одного клуба; четвёртый запрещён.

## Specs
- Governing (registered legacy): docs/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: явный лимит league42, persisted contest текущего сезона, regression, production.
Out: другие турниры, составы пользователей, исторические сезоны.

## Acceptance
- [x] ЛЧ имеет лимит3 в fallback и текущем contest; повторная синхронизация сохраняет3.
- [x] Общие ручной выбор/валидация/автоподбор используют правило3; четвёртый игрок запрещён.
- [x] Проверки и production завершены, cache/memory проверены.

## Result
- Было: league42=2 в общей таблице и текущем contest. Стало: 3 в конфигурации и БД; текущие загрузчики цен используют общую таблицу. Миграция ограничена SPORTS_RU / 42 / 2026/2027, остальные лимиты сверены без изменений.
- Ручной выбор и общая валидация: третий разрешён, четвёртый отклоняется (regression). Автоподбор использует те же rules; существующие optimizer tests проходят.
- npm run check: 1087 passed, 1 skipped; lint, typecheck и production build прошли. Focused tests: 51 passed.
- Production 0.3.66, commit 92f3731f120efb0ea3869eb13d0226f1f1f820c3; workflow 34246570454 success. Миграция finished; /api/health status ok с точным commit; release symlink совпадает.
- ЛЧ: 1027 строк / 1027 уникальных игроков / 944 FFO. READY snapshots: 3. После запуска web 125.7 MiB, worker 1.081 GiB, PostgreSQL 448.8 MiB. Дополнительные worker-процессы для исправления не запускались.
