# WI-022 — Полная статистика и прошлый сезон в прогнозе КХЛ

Kind: change
Canon action: direct-edit

## Outcome
Пользователь сравнивает броски, голы, передачи, штрафные минуты и плюс-минус и видит единый объяснимый EP с опорой на прошлый сезон при короткой текущей истории.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#table
- Governing: spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#normalization
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#schema
- Constraint: spec://modules/khl/FEAT-001-khl-module-and-rules#scoring

## Scope
In: отдельные показатели и сортировки, максимум две десятичные цифры в UI, импорт доступной истории 2025/2026 по подтверждённой связи Sports, маркированный prior и формула EP с разбивкой, локальные проверки, Git и production.
Out: выдуманный индивидуальный xG, изменение официальных начисленных FP, неподтверждённое число удалений вместо известных штрафных минут, футбольные данные.

## Acceptance
- [ ] Пять показателей видны, сортируются, null отличается от нуля; числовое отображение ограничено двумя десятичными цифрами.
- [ ] Прошлый сезон загружен локально и на сервер; источники, покрытие и отсутствие истории видны.
- [ ] Короткая текущая история использует прошлый сезон в EP; G/A/SOG/PIM/+− участвуют в объяснимом расчёте без двойного счёта голов.
- [ ] Проверены идемпотентность импорта, влияние входов на прогноз и отсутствие будущих данных.
- [ ] Выпуск и браузерная проверка завершены; память, кэш и дубли проверены.

## Dependencies
Related: WI-021, WI-017.

## Result
Локально 539 архивных карточек Sports 2025/2026, 24174 PLAYED; переносимый нормализованный bundle 475706 bytes. У Грегуара 60 PLAYED/8 DNP, 3 гола, 16 передач, +4, 22 штрафные минуты, 1199:04 TOI. В архивном источнике нет SOG/PP/PK/атаки, они остаются null; новый EP использует доступные текущие броски и остальные прошлые показатели.

Полный npm run check: 1114 pass / 1 skip; lint 0 errors / 133 warnings; typecheck/build pass. Focused PostgreSQL tests: исторический импорт (concurrency, dedupe, future asOf, prior-only EP, retention, export/import identity) и прежний partial-stat regression — 2 pass без skip. Локальный браузер: отдельные колонки, архивные суммы, EP 11,98 у Грегуара, компоненты/60 прошлых матчей в карточке, overflow 0. Production выпуск и повторная проверка — следующий этап.
