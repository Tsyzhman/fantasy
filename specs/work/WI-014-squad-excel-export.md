# WI-014 — Экспорт полного пула Squad в Excel

Kind: fix
Canon action: none

## Outcome
Пул Squad с более чем1000 игроков выгружается целиком в корректный XLSX.

## Specs
- Governing (registered legacy): docs/API_ROUTES.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: лимит строк экспорта Squad, проверка XLSX через настоящий authenticated API, regression и production.
Out: изменение формата таблицы, состава игроков, цен, фильтров или прав доступа.

## Acceptance
- [ ] Воспроизведён отказ текущего endpoint для1005 строк.
- [ ] Экспорт1005 строк сохраняет каждую строку и тип числовых ячеек; предел5000 остаётся ограниченным.
- [ ] Production исправлен, браузерная проверка пройдена; кэш/память проверены, Git синхронизирован.

## Result
Диагностика: squads/export-table ограничен1000 строк, текущий UCLpool1005; players/export-table уже поддерживает5000. Клиент отправляет полный отфильтрованный пул, сервер отвечает400; UI скрывает техническую причину общим сообщением.
