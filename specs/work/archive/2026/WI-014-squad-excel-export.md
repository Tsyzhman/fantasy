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
- [x] Воспроизведён отказ текущего endpoint для1005 строк.
- [x] Экспорт1005 строк сохраняет каждую строку и тип числовых ячеек; предел5000 остаётся ограниченным.
- [x] Production исправлен, браузерная проверка пройдена; кэш/память проверены, Git синхронизирован.

## Result
Диагностика: squads/export-table ограничен1000 строк, текущий UCLpool1005; players/export-table уже поддерживает5000. Клиент отправляет полный отфильтрованный пул, сервер отвечает400; UI скрывает техническую причину общим сообщением.

До исправления: production smoke34218629349, desktop request1005rows дважды получил400 BAD_REQUEST / rows must contain at most1000 player rows. Прогон остановлен после воспроизведения, чтобы не повторять заведомый отказ во всех viewport. В UI-тесте отдельно устранена гонка ожидания responsive controls: desktop ждёт кнопку, tablet/mobile открывают «Ещё фильтры и выгрузка».

Правка runtimeaf35df1: предел5000 какв players/export-table, без обрезания строк или изменения столбцов. Локальный npmruncheck:1086pass/1skip, lint0errors/105warnings, typecheck/buildpass. После исправления теста: typecheckpass. Spec snapshotcurrent. Deploy34218839176 success; release20260908T111059Z-v0.3.65-af35df1, health0.3.65/af35df1c29877ddc9b68c7aedcdc441bb1ea9564.

Production34219660334: все3 API-теста прошли — 1005 строк прочитаны ExcelJS, каждая строка и числовая цена совпали,5001 отклоняется400. UI-тест ошибочно включал скрытые переводы в accessible name кнопки; исправлен includeHidden без правкиUI. Финальный34220217615 success: API и реальная кнопка скачивания прошли наdesktop/tablet/mobile, число строк скачанного файла совпадает с полным отправленным пулом. После выгрузок web379.4MiB/worker457.3MiB/Postgres946.2MiB. Экспорт не создаёт серверных файлов или кэша; локальные QAартефакты ограничены текущим прогоном.
