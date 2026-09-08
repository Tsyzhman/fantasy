# WI-015 — Восстановить FFO в Squad

Kind: fix
Canon action: none

## Outcome
Доступные прогнозы Foontasy корректно связаны с игроками и видны в Squad.

## Specs
- Governing (registered legacy): docs/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-001-global-ranking-strategy#root

## Scope
In: диагностика FFO источников и текущих привязок, проверенные исправления, синхронизация и snapshot, production verification.
Out: выдуманные прогнозы, смешение Sports/UEFA scoring, снижение требований к идентификации.

## Acceptance
- [x] Причина отсутствия FFO установлена по текущему источнику и БД.
- [x] Доступные прогнозы импортированы и отображаются в опубликованном pool.
- [x] Повтор без дублей, cache/memory проверены; необходимые code checks/deploy завершены.

## Result
Начальная диагностика: ЛЧ Sports922/1037 mappings ниже90%; UEFA0/1044 Sports IDs overlap. Исследуется текущий источник.

Текущий источник проверен через существующий authenticated Foontasy parser: Sports1037 rows,1033 пересечения с Sports.ru,922 mappings. Squad явно читает sourceVariant=sports. Отдельная ошибка UEFA связана с отличающимися external_id; UEFA scoring не подмешивался, этот источник не используется колонкой FFO Squad и не изменялся.

Исправлены22 проверенные связи с существующими CorePlayer из плана действующего deep-map CLI (6MAP_ACTIVE/16MAP_GLOBAL); имена/клубы и доступные DOB сверены, текущие назначения защищены проверками.89 предложенных Sports-only seeds не применялись. Новые игроки не создавались. Backup: /var/backups/fantasy-scout/wi015-ffo-mappings-before.json (содержит исходные prices/maps и полный reviewed plan).

Штатный syncFoontasyForecasts для league42/season2026/2027/sourceVariant=sports успешно импортировал1037 прогнозов,944mapped,sourceSeason85,round1. Все исходные проверки полноты сохранены. Повтор mappingpending0; импорт samplesAdded0/samplesPreserved1037.

Snapshot обновлён:1027 игроков,944 сFFO. Все944 значения в опубликованном payload точно совпали с источником, включая явные нули. В остальных10 опубликованных league snapshots FFO присутствуют. Дубли price/player links0, FFO keys0; retention3 snapshots;396 уникальных стартов сохранились.

Refresh завершился сRSS1045090304bytes приheaplimit1536MiB. После завершения web330.3MiB/worker396.2MiB/Postgres958.5MiB. Изменений runtime/схемы нет; production остаётся0.3.65/af35df1. Проверки — реальные import/replay и точное сравнение published snapshot систочником; дополнительный деплой не нужен.
