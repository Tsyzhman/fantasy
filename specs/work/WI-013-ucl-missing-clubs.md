# WI-013 — Вернуть пять отсутствующих клубов ЛЧ

Kind: fix
Canon action: none

## Outcome
В каталоге ЛЧ видны доступные игроки Sports.ru клубов Буде-Глимт, Брюгге, Сабах, Шахтер и Славия.

## Specs
- Governing (registered legacy canon): docs/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: алиасы пяти клубов, проверенный scoped mapping/backfill, существующие Sports.ru-only identities при отсутствии FotMob, обновление snapshot/cache, тесты и production.
Out: выдуманные статистика и связи игроков, смена существующих ручных назначений, другие турниры и КХЛ.

## Acceptance
- [ ] У всех пяти клубов есть доступные игроки с актуальными ценой/позицией Sports.ru.
- [ ] Подтверждённые FotMob связи используются; provider-only записи не получают выдуманную статистику.
- [ ] Повтор без дублей, snapshot обновлён, проверки и release завершены.

## Result
Диагностика: все 152 цены уже в БД; player/team mapping=0. FotMob roster: Glimt29, Brugge29, Slavia35, Sabah0, Shakhtar0. Отсутствуют алиасы пяти названий.


Промежуточный результат: свежий Sports.ru season85 — 1183 цены, пять клубов157 игроков (25/33/27/32/40). Обновление каталога связало81 игрока; scoped план добавил ещё1 FotMob mapping и75 Sports.ru-only identities. Все157 есть в опубликованном snapshot (общий pool997). Повтор: retained157/planned0/unresolved0. Backup: /var/backups/fantasy-scout/wi013-ucl-mapping-20260908.json. Snapshot CLI ограничен1536MiB, завершился; RSS1006010368 bytes. Unit1086pass/1skip; lint0errors/105warnings; typecheck/buildpass. Production code/browser pending.
