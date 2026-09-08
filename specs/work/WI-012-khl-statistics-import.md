# WI-012 — Загрузка фактической статистики КХЛ

Kind: implement
Canon action: direct-edit

## Outcome
Доступная фактическая статистика КХЛ загружена на сервер и читается в сборщике.

## Specs
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#providers
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#schema
- Constraint: spec://modules/khl/FEAT-002-khl-squad#cards

## Scope
In: проверка источников, календарь/история FP/протоколы в доступном покрытии, точные mappings, ограниченный импорт, повторная загрузка, production и UI проверка.
Out: выдуманные значения, собственный xG, внешние трансферы и изменение Betting.

## Acceptance
- [ ] Фактические доступные значения видны на сервере; покрытие и отсутствующие поля перечислены.
- [ ] Повтор не создаёт дубли; запросы/память ограничены, история не подменяется агрегатами.
- [ ] Проверки, публикация и серверный аудит завершены.

## Result
Локально: 693 профиля разобраны, 638 PLAYED / 375 DNP, 1 строка quarantine из-за несовпадения счёта. Полный повтор 693 профилей: changed=0. Unit 1085 pass / 1 skip; lint 0 errors / 105 warnings; typecheck/build pass; три KHL DB tests pass, включая отзыв FP после PLAYED→DNP. Общий DB runner отклонён защитой betting fixture DB (требует fantasy_betting_test_*); выполнен целевой набор КХЛ. Production pending.
