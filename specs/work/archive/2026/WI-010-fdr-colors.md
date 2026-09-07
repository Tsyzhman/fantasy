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
- [x] Подтверждена причина в текущем production CSS.
- [x] FDR 1–5, неизвестная сложность и домашний/гостевой матч корректны в обеих темах и контекстах таблицы/карточки.
- [x] Проверки релиза и штатный deploy успешны; подтверждён новый commit на сервере.
- [x] Проверены кэш, дубли и память; временные ресурсы освобождены.

## Result
Было: общий .fixture-pill перекрывал цвета FDR одинаковой специфичностью. Стало: :where(.fixture-pill) задаёт нейтральный fallback, уровни FDR 1–5 сохраняют цвет. Домашний/гостевой акцент и неизвестная сложность сохранены.

Исправление cd1ccda опубликовано штатным deploy 34128583204 как 0.3.61 и сохранено в объединённом 0.3.62 / 0d05986 (WI-011). Проверены production CSS, контрактный тест и исходная browser evidence light/dark из output/playwright/fdr-fix/browser-report.txt в основном checkout: цвета совпадают с токенами, cache/storage/duplicate IDs 0. Совместные проверки и ресурсы выпуска см. WI-011; production smoke 34157185770 success.
