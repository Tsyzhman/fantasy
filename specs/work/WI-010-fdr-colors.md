# WI-010: Восстановить FDR на сервере

- Kind: fix
- Canon action: none

## Outcome
На сервере плашки соперников в карточках и таблицах снова используют цвета FDR 1–5.

## Specs
- Governing: spec://modules/machete/FEAT-003-squad-player-card#contracts
- Constraints: NEW_DESIGN.md; docs/DEPLOYMENT.md; docs/PRODUCTION_RELEASES.md.

## Scope
- In: CSS cascade, regression check, isolated patch release, live CSS/browser verification.
- Out: расчёт сложности, данные, изменения Арены из WI-009.

## Acceptance
- [ ] Подтверждена причина в текущем production CSS.
- [ ] FDR 1–5, неизвестная сложность и домашний/гостевой матч корректны в обеих темах и контекстах таблицы/карточки.
- [ ] Проверки релиза и штатный deploy успешны; подтверждён новый commit на сервере.
- [ ] Проверены кэш, дубли и память; временные ресурсы освобождены.

## Result
В работе. Production 0.3.60 / 15b5a6c. Общий .fixture-pill после .fixture-difficulty-1…5 перекрывает цвета при одинаковой специфичности.
