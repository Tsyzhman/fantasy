# План реализации отдельного Fantasy КХЛ

> Пакет ниже сохраняет исходный план. Фактический статус новой задачи реализации: [KHL_IMPLEMENTATION_STATUS.md](KHL_IMPLEMENTATION_STATUS.md). Полный модуль ещё не завершён.

Дата: 2026-09-07. **Спецификации подготовлены; приложение, миграции, импорт и деплой не реализованы.** Пользователь запросил этот пакет документов. Фактическое начало разработки и любой release — последующая задача.

Вход в пакет: [карта](../specs/SPEC-MAP.md), [границы кода](../specs/common/structure.md), [проверка источников](KHL_SOURCE_EVIDENCE_2026-09-07.md).

## Как было → как должно стать

| Было в проверенном коде | Будет по этим спецификациям |
|---|---|
| FPL — отдельный URL и mode общего футбольного Squad | КХЛ — отдельный пункт, экран, DTO, rules/scoring/projection/optimizer |
| 15 игроков, стартовые 11, bench, captain, GK/DEF/MID/FWD | 17 активных, G/D/F=2/6/9, без bench/captain, новая площадка, карточки, таблицы и сравнение |
| Футбольные Core* ID/FK, минуты/per90 | Изолированные Khl* ID/FK, точный TOI/PP/PK в секундах, hockey status и матчи |
| Коэффициенты Фонбета — футбольные пары и последний snapshot | Hockey market dictionary, regulation/OT/SO scopes, история изменения и снятия линий |
| xG есть в исследовании как доступная в КХЛ метрика | Готовый xG поставщика — отдельный обязательный gate доступа и покрытия; собственная модель не разрабатывается |
| Футбольные туры/снимки и transfers | Официальные недели/исключения, мгновенные сценарии, индивидуальные locks и проверка остатка 5 трансферов |

## Этапы и зависимости

Порядок задаёт логические зависимости. Работу над UI на fixtures можно вести после фиксации DTO, но это не закрывает gates реальных источников. Календарные сроки не обещаются до проверки доступа к xG/протоколам.

| Этап | Конкретный результат | Зависит от | Gate выхода |
|---|---|---|---|
| 0. Проверить базу и источники | Сравнение актуального integration head с d25913c; season/contest/week mapping; разрешённый источник статистики; договорённость/проверка готового xG; hockey Фонбет dictionary; официальный score fixture set | Нет | DEP-BASE, DEP-WEEK, DEP-SCORE, DEP-ODDS проверены; XG-01 и DEP-STATS имеют реально проверенный путь поставки, а не публикацию. Нет поставки — эти части остаются blocked |
| 1. Изоляция схемы и contracts | Khl* модели, validators/DTO, flags off, миграции и test fixtures | 0: схема источников/IDs | DB-01/02, MIG-01; футбол до/после идентичен, rollback приложения безопасен |
| 2. Каталог и календарь | Sports.ru hockey adapter; mobile fixtures pagination; provider maps; explicit weeks; revisions/quality/health/jobs | 1 и проверенные источники | ING-01/02/04, RULE-01/02/03; все выбранные игроки mapped, нет смешения ID/спорта |
| 3. Детальная статистика и FP | Protocol/licensed adapter, TOI/PP/PK, goalie SV/GA, injuries, official FP; scoring сверка | 2, DEP-STATS/SCORE | ING-03/05, RULE-04; пороговые неопределённости разрешены либо feature явно provisional |
| 4. Готовый xG и Фонбет | xG adapter, определения/покрытие/версия/история, hockey markets/matching/snapshots/status | 2–3, DEP-XG/ODDS | XG-01, ODD-00…05; разрешённый регулярный доступ подтверждён, снятия не теряются |
| 5. Прогноз и solver | Hockey EP, goalie probabilities, TOI/PP, remaining-fixtures horizon, constrained 17-player/transfer solve | 3–4 | MOD-01/02/03, OPT-01/02/03; проверка малых наборов перебором, bounded runtime |
| 6. Новый Squad и API | Площадка/списки 17, G/D/F cards, table/filter/compare, preferences, local drafts, external baseline read-only, preview/CAS/idempotency | DTO после 1; данные 2–5; DEP-TEAM для verified baseline | UI-01…06, API-01…03, RULE-05; неверные и stale операции отклонены сервером |
| 7. Проверка модели и пилот | Rolling-origin + ablation, 2 недели shadow, 14 дней ingestion soak, нагрузочные/регрессионные замеры | 2–6 | MOD-04, ING-06, лимиты памяти/очереди/кэша и футбол без регрессий |
| 8. Последующее включение | Отдельная задача выпуска: backup, migration, limited backfill, flags для пилота, наблюдение и rollback plan | Все обязательные gates, решение о выпуске | Модуль объявляется доступным только после проверки; здесь этот этап не выполняется |

## Проверка правил и источников на этапе 0

Собрать обезличенные разрешённые fixtures: обычный матч, OT, SO, сухой матч, замена goalie, пустые ворота, нечётные SV, ровно 10:00/40:00 при наличии образца, игрок в составе без TOI, missing PP, перенос, ранняя неделя 1 с завершением 14 сентября. Для невозможного найти edge-case не выдумывать fixture как официальный факт: он остаётся незакрытым вопросом локального scoring.

Каталог и базовый календарь подтверждены, но не равны готовности всего pipeline. Будущие start_fives, полные звенья и стабильная выгрузка xG отсутствуют в проверенных источниках. Для последних нужен provider gate, а не UI-обещание. Звонки/письма поставщикам в текущей задаче не отправляются.

## Миграционная последовательность

1. Получить актуальный schema baseline и staging-копию. Сверить новые FPL/provider models, добавленные после текущего worktree. При интеграции добавить строки КХЛ в существующие SPEC-MAP/structure, не заменяя их содержимое целиком.
2. Только additive Khl* schema, свои PK/FK/indexes и settings. Проверить миграцию на пустой и populated БД. Никаких изменений Core* PK, старых squad defaults, football enum/allowlist и existing provider ID mapping.
3. Идемпотентный seed competition/season/rules; current/history backfill ограниченными batches. Источник и nullability сохранены, пользователи не получают искусственных составов.
4. Публиковать только complete read-model revision. После перехода на новую версию parser/model прежняя остаётся для сравнения и отката, в рамках retention.
5. Снять контрольные football counts/aggregates на одном snapshot до и после. Неподвижные пользовательские records должны совпадать byte/hash-wise по выбранным полям. Не сравнивать живую БД в разные моменты и считать естественные обновления регрессией.
6. Rollback: выключить KHL flags, остановить новые jobs, завершить/cancel текущие, вернуть приложение. Таблицы/историю не DROP. Football workers продолжают прежний режим; ресурсные квоты КХЛ не вытесняют их.

## Сквозная приёмка

| Область | Обязательные примеры | Ссылка на контракт |
|---|---|---|
| Rules | 2/6/9, cap 3, 20 000 initial и переоценённый капитал, 5/6 трансфер, неделя 1, goalie scoring | [FEAT-001](../specs/modules/khl/FEAT-001-khl-module-and-rules.md) |
| Data | Reimport/retry/correction, collision ID, incomplete page, null PP/SV, all clubs, готовый xG gate | [INFRA-001](../specs/modules/khl/INFRA-001-khl-data-ingestion.md) |
| Storage/API | CAS race, idempotency retry, A→B→A value history, чужой squad, stale quote, sport mismatch, app rollback | [INFRA-002](../specs/modules/khl/INFRA-002-khl-storage-and-api.md) |
| Odds | Regulation vs OT/SO, line/period uniqueness, aliases/перенос, tombstone vs timeout, no future leakage | [INFRA-003](../specs/modules/khl/INFRA-003-khl-fonbet-odds.md) |
| Squad | 17 без bench, responsive/keyboarding, G/D/F presets, keep vs lock, remaining games, compare/null | [FEAT-002](../specs/modules/khl/FEAT-002-khl-squad.md) |
| Projection/solve | Conditional goalie, E[floor(SV/2)], PP exposure, deterministic result, brute-force oracle, cancellation, leakage audit | [FEAT-003](../specs/modules/khl/FEAT-003-khl-projections-and-optimizer.md) |

Полноценный xG-релиз не считается готовым при отсутствии XG-01. Read-only каталог или beta baseline можно отдельно принять только с точно указанным ограниченным объёмом; это не закрывает исходное требование готового xG и полного хоккейного модуля.

## Отсутствие регрессий футбола

При реализации запускать существующие проверки, а не переписывать ожидаемые значения под новый код:

- `src/server/fpl-provider-contract.test.ts`, `src/lib/providers/fpl.test.ts`, `fpl-scoring.test.ts`, `src/app/machete/fpl/squad/page.contract.test.ts` — FPL правила/маршрут/источники.
- `src/machete/squad_logic.test.ts`, `squad_planner.test.ts`, `squad-table-columns.test.ts`, history/filter tests, `src/components/machete/fantasy-squad-worker-handler.test.ts` — футбол 15/11/4, captain/bench, saved squads и настройки.
- `src/providers/fonbet/odds.test.ts`, `src/machete/fixture-odds-sync.test.ts`, `src/server/fixture-odds-scheduler.test.ts` — football odds неизменны.
- `src/core_data/ingestion.test.ts`, `ingestion-jobs.test.ts`, `src/machete/sports_ru_squad_import.test.ts`, `sports_ru_squad_snapshots.test.ts` — football import/read-only profile.
- `e2e/squad-journey.spec.ts`, `e2e/squad-responsive.spec.ts` — прежние маршруты и responsive. Добавить отдельные KHL e2e, не менять football journey на hockey.

На этапе кода финальные команды после последней правки: `npm run test`, релевантный `npm run test:db` со staging/test БД, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`; проверка drift через `npm run prisma:migrate:diff` в безопасном окружении. Next typegen/build выполнять последовательно из-за `.next`. Добавить KHL тесты по ID приёмки, прогон schema migrations, read-model/API contracts и ресурсные сценарии. В текущей задаче документов эти прикладные команды не требуются и не выполнялись.

## Ресурсы, кэш и дубли на каждом этапе

После 1–2: uniqueness/FK, duplicate job lease, counts после повторного batch. После 3–4: размер raw, retention, однозначные provider mappings, sequence истории A→B→A, отсутствие удвоения DOM событий. После 5–6: solver timeout/abort, один worker, bounded pool, отдельные cache keys спорта и пользователя. После 7: 14 дней soak, queue depth, 50 UI переходов/подборов, heap/RSS plateau, football latency до/после под сопоставимой нагрузкой.

Стартовые численные бюджеты заданы в INFRA-001 и FEAT-002. Любое превышение фиксируется как непрошедшая приёмка, не скрывается очисткой пользовательских/football данных. В этой документной задаче кэш источников не создавался, зависимости не ставились, процессы приложения не запускались.

## Результат текущей задачи

Подготовлены 6 предметных спецификаций FEAT/INFRA, карта и технические границы, проверка источников и этот план. Все новые specs имеют `status: draft`: это проработанное предложение с критериями реализации, а не отметка о готовом работающем модуле. Реальные незакрытые зависимости перечислены в evidence; от них зависит последующая разработка и выпуск.
