# WI-007: Объединённый выпуск локальных изменений 7 сентября

- Kind: `migration`
- Canon action: `direct-edit`

## Outcome
Общий чистый Git release сохраняет сегодняшние локальные изменения и действующий production и безопасно запущен на сервере.

## Specs
- Governing: `spec://modules/betting/FEAT-001-virtual-league#root`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.
- Constraint: docs/DEPLOYMENT.md, docs/PRODUCTION_RELEASES.md; существующие FEAT Machete 001–004.

## Scope
- In: Git consolidation, конфликты, совместимость миграций, проверки, immutable release, backup/rehearsal/canary, health и ресурсы.
- Out: покупка feeds, включение неподтверждённых KHL источников, изменение продуктовых правил.

## Acceptance
- [x] Все локальные исходные изменения сохранены; временные credentials не включены.
- [x] Release содержит origin/main и действующий production commit.
- [x] Совместная схема, tests/lint/typecheck/build проходят.
- [x] Backup, rehearsal и production revision/health подтверждены.
- [x] Проверены пользовательские маршруты, дубли, кэши и память.

## Result
Завершено. Исходный production d9abf51 (0.3.57); локальные изменения сохранены в codex/local-september7-snapshot, КХЛ в codex/khl-local-complete-20260907. Интеграция codex/integrated-release-20260907.

Predeploy: npm run check — 1069 pass/1 skip, 0 fail; lint 0 errors/101 warnings; typecheck и production build pass. 46 migrations на новой локальной БД, schema drift отсутствует; KHL storage/data-layer и betting wallet DB checks pass. KHL browser 9 pass/16 scoped skips, retained JS data +260 bytes, DOM/listeners стабильны; полный JIT-inclusive heap +10.89% записан отдельно. Проверены отсутствие credential в исходном diff и сохранение всех новых football runtime файлов из локального снимка.


Production успешно обновлён до 0.3.58, a23d3a00b413c5e3020435c0193f79e1c9bfb2d0, release 20260907T102720Z-v0.3.58-a23d3a0. Workflow 34111055172 success; manifest, внешний health и OCI labels web/worker совпадают. Backup /var/backups/fantasy-scout/pre-20260907T102720Z-v0.3.58-a23d3a0-migration.dump, 61 645 350 bytes, SHA-256 347dbea30661464594c415b8f5e27e08c01320f13568ae0e524178766c095ef8. Restore/rehearsal, 46 migrations и canary прошли. Во время миграционного этапа web/worker были остановлены штатным promoter; непрерывное измерение точного downtime не выполнялось.

Итоговый local check и Linux check: 1069 pass, 1 skip; lint 0 errors/101 warnings, typecheck/build pass. Football browser после сохранения стабильного accessible имени кнопки Import Sports squad: 3 pass/1 skip; её подробный title сохранён. Production browser workflow 34112100695: authentication 1 pass, UI 4 pass/17 предусмотренных skips (в том числе отключённые production KHL tests).

Пользователи/составы/счета после миграций: 30/140/33, совпадают с predeploy. Ledger mismatch, initial grants duplicates и ticket duplicates: 0. KHL production contests: 0, flags остаются выключенными, XG-01 и прежний WI-001 не объявлены завершёнными этим выпуском.

Сервер после smoke: web 665.8 MiB, worker 2.147 GiB, PostgreSQL 1.372 GiB; healthy/restarts=0 у web и worker. Build cache после штатной очистки 351.1 MB; старый лишний release удалён, сохранены текущий и один rollback. Canary, setup image и rehearsal DB убраны. В локальном тестовом контуре raw=52 bytes, read cache=0, duplicate groups=0, все 4 jobs DONE, удалены 2 expired previews; synthetic browser session отозвана, Next/PostgreSQL остановлены. Исторические ignored heap/cache файлы, удаление которых ранее блокировалось автоматической проверкой, сохранены; обход не выполнялся.

Git: полный локальный снимок b56901e, KHL snapshot 68ee522, общий source a23d3a0. Основная папка Documents/fantasy_export переключена на main после точной проверки соответствия исходных файлов сохранённому snapshot; никакие пользовательские изменения не сброшены. Зависимости установлены через npm ci, Prisma Client пересоздан. Follow-up commit содержит только этот результат и evidence; runtime source остаётся a23d3a0.
