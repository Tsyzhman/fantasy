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
- [x] Фактические доступные значения видны на сервере; покрытие и отсутствующие поля перечислены.
- [x] Повтор не создаёт дубли; запросы/память ограничены, история не подменяется агрегатами.
- [x] Проверки, публикация и серверный аудит завершены.

## Result
Локально: 693 профиля разобраны, 638 PLAYED / 375 DNP, 1 строка quarantine из-за несовпадения счёта. Полный повтор 693 профилей: changed=0. Unit 1085 pass / 1 skip; lint 0 errors / 105 warnings; typecheck/build pass; три KHL DB tests pass, включая отзыв FP после PLAYED→DNP. Общий DB runner отклонён защитой betting fixture DB (требует fantasy_betting_test_*); выполнен целевой набор КХЛ. Production 0.3.63 / runtime 28a5427a11c6782f4b31f4eb2d4ceb7a9e6cde2d / release 20260908T075518Z-v0.3.63-28a5427. Deploy 34201405135 success. Все 693 профиля обработаны; 1013 player-match (638 PLAYED / 375 DNP), 638 FP, 435 сыгравших игроков / 33 goalie-match. Один quarantine Соколов 2026-09-05 Спартак. Повтор imported=0 / changed=0; receipts 14259 стабильны, duplicate groups=0 / raw=0. Контрольные Грегуар 1250sec/7FP и Кульбаков 3573sec/SV33/GA1/15FP совпали. Browser 34202294303 после завершения backfill: auth 1 pass, UI 13 pass / 20 skips (первый преждевременный запуск честно записан в docs/KHL_IMPLEMENTATION_STATUS.md). Web/worker healthy / restarts=0; дополнительный CLI-процесс завершён, RSS загрузчика 206084→225180 KiB; итог web 491.6 MiB, worker 1.11 GiB, PostgreSQL 957.9 MiB. Миграций 46 / незавершённых 0. PP/PK/xG не заявлены загруженными; подробное evidence — docs/KHL_IMPLEMENTATION_STATUS.md.
