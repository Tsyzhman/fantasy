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
- [ ] ЛЧ имеет лимит3 в fallback и текущем contest; повторная синхронизация сохраняет3.
- [ ] Общие ручной выбор/валидация/автоподбор используют правило3; четвёртый игрок запрещён.
- [ ] Проверки и production завершены, cache/memory проверены.

## Result
В коде league42=2, sync записывает этот лимит в contest; Squad использует persisted contest сfallback той же таблицы.
