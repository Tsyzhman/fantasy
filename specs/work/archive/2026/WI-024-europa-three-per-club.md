# WI-024 — Три игрока одного клуба в Лиге Европы

Kind: fix
Canon action: none

## Outcome
В Squad Лиги Европы можно выбрать до 3 игроков одного клуба; четвёртый запрещён.

## Specs
- Governing (registered legacy): docs/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root
- Related: WI-016

## Scope
In: явный лимит league 73, persisted contest текущего сезона, regression, production.
Out: другие турниры, составы пользователей, исторические сезоны.

## Acceptance
- [x] Лига Европы имеет лимит 3 в fallback и текущем contest; повторная синхронизация сохраняет 3.
- [x] Общие ручной выбор/валидация/автоподбор используют правило 3; четвёртый игрок запрещён.
- [x] Проверки и production завершены.

## Result
- Было: league 73=2 в общей таблице и текущем contest. Стало: 3 в конфигурации и БД; текущие загрузчики цен используют общую таблицу. Миграция ограничена SPORTS_RU / 73 / 2026/2027, остальные лимиты сверены без изменений.
- Ручной выбор и общая валидация: третий разрешён, четвёртый отклоняется (regression). Автоподбор использует те же rules.
- Локально: focused tests 53 passed; полный набор 1130 passed / 1 skipped; lint 0 errors; typecheck и production build прошли.
- Production 0.3.75, commit `571946036223be2689bebff730bed8a19273ab5e`, release `20260916T152502Z-v0.3.75-5719460`. GitHub Actions упёрся в квоту артефактов; выпуск прошёл тем же immutable archive и `deploy-production-docker.sh` через SSH Host `deploy`. Миграция applied; `/api/health` status ok с точным commit; symlink и image labels совпадают.
- Contest: `73/2026/2027` = 3, `42/2026/2027` остаётся 3. web/worker healthy, restarts=0. Evidence: `specs/work/evidence/WI-024/production.md`.
