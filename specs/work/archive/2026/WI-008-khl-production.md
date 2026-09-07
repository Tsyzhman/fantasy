# WI-008: КХЛ на сервере и исправления Betting

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome
Production показывает реальный каталог КХЛ, сохраняет и восстанавливает составы; Betting использует список Squad и советы пяти моделей для выбранного матча, включая историю национальных лиг и ЛЧ/ЛЕ.

## Specs
- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.

- Governing: `spec://modules/betting/FEAT-001-virtual-league#feed`.
- Governing: `spec://modules/betting/FEAT-001-virtual-league#algorithms`.
- Governing: `spec://modules/khl/FEAT-002-khl-squad#root`.

## Scope
- In: каталог/worker/восстановление КХЛ; лиги Squad в Betting, советы внутри матча, история ЛЧ/ЛЕ + чемпионатов, скрытие ручного settlement UI; разовый сброс ставок по прямому поручению; production acceptance.
- Out: неподтверждённые feeds, xG, обученный прогноз и отправка трансферов провайдеру.

## Acceptance
- [x] Проверенный турнир и полный реальный каталог доступны на production.
- [x] Повторная синхронизация обновляет свежесть без дублей и неограниченного накопления receipts.
- [x] Авторизованный браузер открывает раздел на desktop/tablet/mobile.
- [x] Проверены выпуск, здоровье, память и очередь.

- [x] Betting использует общий список Squad, включая лиги без событий.

- [x] В выбранном матче отображаются пять персональных советов алгоритмов.
- [x] По прямому поручению пользователя Betting сброшен с резервной копией и восстановлением стартовых балансов.

- [x] КХЛ восстанавливает последний свой состав при входе; можно открыть новый вариант.
- [x] ЛЧ/ЛЕ используют историю чемпионатов и прежнего общего этапа; неизвестное основное время не подменено.
- [x] Вкладка ручного расчёта убрана.

## Result
Завершено. Было: KHL_ENABLED=false и 0 турниров после 0.3.58; Betting ограничивался загруженными лигами, советы находились только в купоне, еврокубки блокировались целиком.

Стало: production 0.3.60, commit 15b5a6c9083cf60a292a90f7ef4bf9167c5b0bdd, release 20260907T112939Z-v0.3.60-15b5a6c. Каталог КХЛ 694/22, fenced single-flight refresh 45s, стабильные receipts при одинаковых данных, восстановление собственного варианта и явный новый вариант. Календарные/protocol/xG gates остаются открыты; неподтверждённые данные не сгенерированы.

Betting использует общий список 12 лиг Squad и серверный запрет ставок вне списка. Пять советов находятся внутри выбранного матча; устаревшая линия отключает действия. Вкладка ручного расчёта и диалог убраны; виртуальное settlement сохранено. Для ЛЧ/ЛЕ доступны история национальных чемпионатов и прошлых общих этапов; окна 20/8 сохраняют до 8/3 европейских игр. Пустой CoreMatch score может использовать явно сохранённые goals обеих команд, а не сумму игроков. Все пять проверенных настоящих матчей ЛЧ получили численные оценки всех моделей; cutoff проверен. Для плей-офф основное время не выдумывается.

Проверки: CI workflow 34116440816 — 1075 unit tests pass, lint 0 errors/98 warnings, typecheck/build pass. DB catalog test на 694 строках проверил повтор без receipts, correction и отсутствие дублей; wallet DB test проверил отказ вне Squad, concurrency/retry и автоматическое settlement общего этапа ЛЧ при сохранении запрета неоднозначного финала. Production smoke 34117242298 — auth 1 pass, UI 10 pass/17 intended skips: desktop/tablet/mobile, действительные UCL model inputs, 5 советов, KHL save/reload/return/new variant. Первый smoke 34115224750 выявил duplicate-name конфликт при новом входе; default restore исправлен и повторная приёмка прошла.

По прямому поручению пользователя разово сброшены 50 открытых ставок (50 000 монет) и 125 прежних решений. Все 33 счёта восстановлены до 100 000 монет; ledger mismatch/duplicates=0. Backup таблиц Betting сохранён и проверен через pg_restore --list; путь и SHA-256 в evidence. После smoke снята временная lease-пауза: цикл 11:38:24 UTC успешен, 12 лиг/202 события, 39 новых ставок версии 2026-09-07.2, вне Squad=0, ledger mismatch=0, duplicate tickets=0. Повторного сброса новых ставок не выполнялось.

Ресурсы после smoke: web 433.6 MiB, worker 131.3 MiB, PostgreSQL 1.188 GiB; web/worker healthy, restarts=0. KHL raw=0, receipts=2776 стабильны после нескольких циклов, единственный QA draft повторно использован, duplicate entries=0. Штатный promoter сохранил текущий и один rollback; build cache 82.95 MB. Локальный тестовый PostgreSQL остановлен. Исторические ignored cache/heap files, удаление которых ранее блокировалось, не тронуты.

Новых миграций не добавлено: 46 applied, 1 историческая rolled-back audit row, unfinished=0. Evidence: specs/work/evidence/WI-008. Следующий за runtime commit содержит только усиленные browser tests и этот отчёт; runtime diff отсутствует.
