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
- [ ] Лига Европы имеет лимит 3 в fallback и текущем contest; повторная синхронизация сохраняет 3.
- [ ] Общие ручной выбор/валидация/автоподбор используют правило 3; четвёртый игрок запрещён.
- [ ] Проверки и production завершены.

## Result
