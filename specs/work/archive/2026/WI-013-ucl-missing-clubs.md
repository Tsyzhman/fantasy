# WI-013 — Вернуть пять клубов ЛЧ и выставить старты УЕФА

Kind: fix
Canon action: none

## Outcome
В каталоге ЛЧ видны доступные игроки Sports.ru клубов Буде-Глимт, Брюгге, Сабах, Шахтер и Славия; у 36 клубов выставлены прогнозируемые старты УЕФА.

## Specs
- Governing (registered legacy canon): docs/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: алиасы пяти клубов, проверенный scoped mapping/backfill, существующие Sports.ru-only identities при отсутствии FotMob, обновление snapshot/cache, тесты и production.
Дополнение пользователя: выставить прогнозируемые старты 36 клубов ЛЧ по статье УЕФА от 2026-09-08; сохранить источник, проверить 11 уникальных игроков и одного GK на клуб, обновить snapshot.
Out: выдуманные статистика и связи игроков, смена существующих ручных назначений, другие турниры и КХЛ.

## Acceptance
- [x] 36 прогнозируемых XI сверены с УЕФА, применены с backup и provenance; повтор не меняет данные.
- [x] У всех пяти клубов есть доступные игроки с актуальными ценой/позицией Sports.ru.
- [x] Подтверждённые FotMob связи используются; provider-only записи не получают выдуманную статистику.
- [x] Повтор без дублей, snapshot обновлён, проверки и release завершены.

## Result
Диагностика: все 152 цены уже в БД; player/team mapping=0. FotMob roster: Glimt29, Brugge29, Slavia35, Sabah0, Shakhtar0. Отсутствуют алиасы пяти названий.


Свежий Sports.ru season85 — 1183 цены, пять клубов157 игроков (25/33/27/32/40). Обновление каталога связало81 игрока; scoped план добавил ещё1 FotMob mapping и75 Sports.ru-only identities. Все157 есть в опубликованном snapshot. Повтор: retained157/planned0/unresolved0. Backup: /var/backups/fantasy-scout/wi013-ucl-mapping-20260908.json. У Sports-only игроков нет выдуманных match_player_stats.

По статье УЕФА от 2026-09-08 (source URL сохранён в scripts/data/uefa-ucl-md1-2026-09-08.json) выставлены396 стартов: 36 команд × 11, одинGK на команду, provenanceUEFA у36. Реальные матчевые составы не изменялись. Варианты транслитерации разобраны явно; Camara — нападающий Suleiman, Haugen — левый защитник Kristoffer согласно позиции в упорядоченном XI (интерпретация сокращённого имени источника). Подтверждены восемь отсутствовавших Sports.ru связей с существующими FotMob игроками по клубу, имени и публичной дате рождения. Добавлены23 проверенных membership для22 Sports-only стартеров иNoahFernandez; новые CorePlayer для этой операции не создавались.

Backup до стартов: /var/backups/fantasy-scout/uefa-md1-20260908-before.json; до дополнительных семи связей: /var/backups/fantasy-scout/uefa-md1-20260908-prices-before.json. Повтор: priceRepairs0/memberships0, все36UNCHANGED. Финальный опубликованный snapshot:1005 игроков; все396 IDs стартов точно совпали с reviewed source. Пять клубов25/33/27/32/40; duplicateprice/playerlinks0; retention3 snapshots. Последний refresh RSS767184896bytes приheaplimit1536MiB, процесс завершён. После работы web363MiB/worker401.9MiB/Postgres959.7MiB.

Проверки: полный npmruncheck —1086unitpass/1skip, lint0errors/105warnings, typecheck/buildpass. После добавления UEFA CLI: typecheck иfocusedlintpass,60 mapping/probable-lineup tests pass. Browser production smoke34206172543 success (desktop/tablet/mobile); первоначальный тест ошибочно искал мобильную вкладку Pool какbutton, исправлен наradio без измененияUI.

Release0.3.64: runtimea7dbc118238a492481cb301e80f850ccf0684d22, deploy34205046454 success, /var/www/fantasy-scout-releases/20260908T083637Z-v0.3.64-a7dbc11, /api/health=ok. UEFA — разовая операция данных поверх этого runtime; версия типа источника стирается TypeScript, новый сетевой адаптер/расписание не добавлялись.
