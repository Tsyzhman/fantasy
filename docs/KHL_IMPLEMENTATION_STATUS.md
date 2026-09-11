# КХЛ: реализация и проверка 7 сентября 2026

Актуальный выпуск: **0.3.62 / 0d05986**, production 2026-09-07. Сборщик КХЛ адаптирован из футбольного contact-sheet, 17 активных мест и действия сохранены. Вместе опубликованы локальные доработки Betting и сохранён FDR fix. Проверки и точные ограничения: `specs/work/archive/2026/WI-011-khl-football-design.md`. Ниже сохранена история первоначальной реализации.


Рабочая база: `d25913c0831ed94fd6f023c41459802d47f05299`, версия 0.3.21, checkout `c18e/fantasy_export`.

Локальный модуль расширен до работающей цепочки хранения, чтения данных, планирования и подбора. **Production-ready xG-модулем это не является:** разрешённые production feeds, точные спорные границы scoring и проверка модели на реальных данных остаются незакрытыми. Beta baseline не заменяет xG-модель. Деплоя, production-импорта, покупки источников и внешних трансферов не было. Prist не использовался.

## Было → стало

| Было | Стало |
|---|---|
| Базовые KHL таблицы и универсальные revisions | External entity maps, исторические roster memberships, протоколы, availability, официальные FP, готовый xG, provider snapshots, прогнозы по матчам, odds snapshots, source contracts и checkpoints |
| Календарь только разбирался в памяти | Ограниченный mobile transport с descending pagination, проверкой watermark/дублей/размера; атомарное сохранение и явные назначения fantasy-неделям |
| Неизвестные поля карточек всегда были заглушками | Чтение нормализованных данных; средние за 5/10/20 сыгранных матчей, источники и даты, история цены/FP, будущие матчи через историческую принадлежность клубу |
| Кнопка подбора всегда отключена | API подготовки, Worker ≤1000 кандидатов/5 секунд, отмена, серверная проверка результата, сохранение условного локального варианта |
| Настройки вида не подключены | Сохранение фильтров, сравнения и сортировки; профили G/D/F, минимальный TOI, 1–4 официальные недели EP |
| Локальная трансферная кнопка считала только в браузере | Для сохранённого состава используется серверный preview с quote, expiry, CAS и идемпотентным применением; EP по интервалам владения |
| Все суммы ограничивались первоначальными 20 000 | Сервис подтверждённых provider snapshots; проверка переоценённого капитала по snapshot holdings + bank; ручное изменение состава снимает привязку к официальному baseline |
| Только одиночный CLI каталога | Bootstrap по явным метаданным сезона, catalog/calendar/baseline команды; coordinator с heartbeat, fencing, bounded retries, checkpoints и health |
| Старый сборщик web-vitals накапливал visibility listeners при кликах | Основные метрики собирает web-vitals 5.3.0 один раз на документ; совместимый 4.2.4 используется только для FID. После 50 переходов обработчики 389 → 389 |

## Что реализовано

- Миграции `000033`, `000034`, `20260907000035`, `20260907000036` изолируют хоккей от футбольных Core* сущностей. Shared User содержит только обратные ORM relations. SQL проверяет единичную цель mapping, scope FK, диапазоны, позиции, уникальность активных jobs и наблюдений.
- `src/server/khl/data-layer.ts`, `observations.ts`, `catalog-sync.ts`: нормализованные импорты, точные ID без слияния по имени, A→A dedup, A→B→A история, corrections, отделение DNP от неизвестных данных, field provenance. Повтор Sports.ru tag ID у разных строк отклоняется.
- `src/server/khl/read-model.ts`: ограниченные запросы без process cache, null-aware агрегаты, матчи по клубу на дату игры, официальные FP отдельно от EP. Неполная история не дополняется нулями. API pagination возвращает данные в repeatable-read snapshot.
- `src/providers/khl-mobile/transport.ts`: только наблюдавшийся endpoint/query; ≤42 дней/100 страниц/2000 матчей/5 MiB на страницу, timeout и abort. CLI требует подтверждённый source contract перед mobile загрузкой. Покрытие календаря хранит конкретные from/to, а не безусловную полноту сезона.
- `src/server/khl/lease.ts`, `coordinator.ts`: token и expiry проверяются при публикации импорта внутри транзакции. Coordinator фиксирует checkpoint только владельцу lease, повторяет временные ошибки максимум до 3 попыток, постоянные schema/permission ошибки не зацикливает.
- `src/server/khl/optimizer-service.ts`: владелец, версия состава, календарь горизонта, свежая публикация, keep/exclude, club/position/budget, недоступные покупки и lock holdings. Уже сохранённые операции учитываются в недельном лимите. При неизвестном внешнем состоянии результат имеет статус CONDITIONAL_DRAFT.
- `src/components/khl/useKhlOptimizer.ts`: один Worker; terminate на завершении, отмене, ошибке и unmount. Сервер повторно проверяет proposal. Изменение исходных данных инвалидирует прогноз через dataRevision.
- `src/khl/forecast-model.ts`: точное суммирование по совместным состояниям участия/TOI/исхода/SV/GA, variance, проверка future inputs; интервальная оценка плана; MAE/Brier для внешних проверочных наборов. **Это вычислительное ядро, не обученная модель распределений хоккейных событий.**
- `src/server/khl/forecast-publication.ts`: воспроизводимая публикация отдельно обозначенного FP10 beta baseline на реальные назначенные матчи 1–4 недель. Нет выдуманного xG и нет скрытого обучения на будущих данных.
- `src/server/khl/odds-storage.ts`: раздельные scopes/periods/lines; unchanged dedup, исправления, withdrawn при полном успешном снимке, outage сохраняет старые значения как stale. Непроверенный dictionary отвергается.
- В интерфейсе сохранены 17 активных мест 2G/6D/9F, независимые keep и provider lock, карточки, сравнение, история и календарь. Загружаемые настройки перенесены в SSR, чтобы поздний ответ не перезаписывал ввод пользователя.

## Проверки

- Unit suite: 830 tests, 829 pass, 1 предусмотренный skip, 0 fail. Включён подбор из 1000 кандидатов с ограничением времени и проверкой допустимого состава. Запуск без DATABASE_URL, как требует существующий тест конфигурации.
- DB suite: 5/5 pass на отдельном `127.0.0.1:55439/khl_test`. Проверены mapping conflict, revisions/replay/correction, PP TOI > TOI rejection, null handling, API ownership/CSRF/CAS, quote staleness, idempotency, retry/checkpoint и запрет публикации с потерянной lease.
- Populated migration audit: в отдельной локальной БД применены миграции 1–32, восстановлены только синтетические футбольные fixtures, затем применены 33–36. Все row hashes 11 футбольных таблиц совпали. Среди них 80 players, 80 prices, 50 matches, 160 forecasts и 50 odds snapshots.
- `prisma:migrate:diff`: No difference detected. Проверка выполнена с отдельной shadow DB.
- Typecheck и production webpack build проходят. Lint: 0 errors; остаются предупреждения локализации КХЛ и прежние предупреждения football UI.
- Football browser regression: 3 pass, 1 предусмотренный mobile journey skip. Оригинальные тесты поиска/подбора/сохранения/удаления и desktop/mobile responsive проходят на синтетических данных. Проверки не ослаблены.
- Финальный KHL browser: 9 pass, 16 предусмотренных skips (четыре ресурсных/интеграционных сценария выполняются только на desktop; все 17 мест проверены на каждой из пяти ширин 360/390/768/1024/1440). 50 worker runs: максимум 1 Worker, после завершения 0; heap 5 725 788 → 5 909 972 bytes (+3.22%). 50 фильтраций: 4 986 844 → 5 129 632 bytes (+2.86%). Отмена проверена на реально созданном Worker без применения proposal.
- 50 переходов КХЛ ↔ FPL после 55 циклов прогрева: heap 8 232 244 → 8 583 060 bytes (+4.26%), документы 1 → 1, DOM 801 → 801, listeners 389 → 389. Порог 10% сохранён. Причина отдельного прогрева подтверждена heap snapshots: около 0.9 MiB начального роста приходится на V8 compiled code/bytecode; после первых 5 циклов полный heap ещё рос примерно на 14%. Эти локальные синтетические проверки не доказывают многодневную стабильность.
- Исправление телеметрии опирается на [upstream changelog web-vitals](https://github.com/GoogleChrome/web-vitals/blob/main/CHANGELOG.md): исправления listener leak в 4.2.4 и дальнейшей очистки callbacks в 5.x. Все шесть прежних метрик, включая FID, сохранены. Football regression повторён после этого изменения: 3 pass, 1 skip.

## Ресурсы и завершение локального прогона

- Read process cache КХЛ: 0 bytes. Raw storage: 7 строк, 182 compressed bytes; duplicate groups: 0. Duplicate active jobs: 0. Просроченных preview удалено 7, тестовых browser sessions отозвано 3.
- Остановлены запущенные для проверки Next server на 3107 и отдельный PostgreSQL на 55439; слушающих процессов на этих портах после остановки нет. Worker после тестов не оставлен.
- Автоматическая проверка отклонила составную команду окончательной очистки с причиной `blocked by policy`; обход не выполнялся. Поэтому оставлены `.next/cache` (478 246 448 bytes), два диагностических heap snapshots (27 241 090 bytes), SQL dump синтетических football fixtures, локальный auth-файл с уже отозванной сессией и тестовые базы. В остановленной тестовой БД остаётся одно старое PENDING задание provider TEST; фоновый runner не запущен. Эти файлы находятся в ignored output/cache и не входят в исходные изменения.

## Незакрытые зависимости выпуска

| Зависимость | Что ещё нужно |
|---|---|
| XG-01 | Разрешённый стабильный player-match feed готового ixG, определения/IDs, предыдущий сезон и ≥100 матчей, ≥95% player/team coverage, ≥90% каждого клуба, corrections и 14 дней freshness |
| Полные протоколы | Проверенный production источник TOI/PP/PK/SV/GA и разрешение на автоматическую загрузку; normalized adapters не доказывают готовность реального feed |
| Scoring и неделя | Подтверждение ровно 10:00/40:00, goalie edge cases и timezone официального сброса. Недели не вычисляются по понедельникам |
| Fonbet | Реальные hockey factor/period/settlement fixtures и разрешённый transport. Football factor IDs не использованы |
| Provider team | Проверенный read-only endpoint, привязка владельца, банк и weekly transfers. Пока нет свежего доверенного снимка, import возвращает недоступность |
| Основная модель | После получения feeds: построение и калибровка совместных распределений/признаков на реальных хоккейных данных, rolling-origin, ≥8 недель holdout, ablation xG/odds, ≥2 недель shadow. Вычислительное ядро и beta baseline не закрывают этот пункт |

Длительные наблюдения и обучение не проводились и не заменены mocks. До WI-008 КХЛ flags оставались выключенными; текущее подключение production описано ниже. Незакрытые gates из таблицы сохраняются.

## Воспроизведение

Только отдельная тестовая БД. CLI: `npx tsx scripts/khl-runner.ts status`; для мутаций нужен `KHL_SYNC_ENABLED=true`. Команды: `bootstrap metadata.json`, `catalog CONTEST`, `calendar CONTEST FROM_ISO TO_ISO`, `baseline CONTEST WEEK_ID[,WEEK_ID]`, `prune`. Bootstrap требует явные season/provider IDs и evidence.

Тестовые fixtures: `scripts/khl-seed-test.ts`, `scripts/khl-football-regression-seed.ts` требуют `KHL_TEST_DATABASE=true` и точный локальный URL. Браузерные конфиги: `playwright.khl.config.ts`, `playwright.khl-regression.config.ts`. Тестовые авторизационные файлы не должны попадать в git.

## Интеграция общего релиза 0.3.58

7 сентября модуль объединён с действующим production d9abf51 и полным локальным снимком global strategy, rotation risk и contact-sheet UI. Для первого production применения четыре ещё не выпускавшиеся KHL миграции переименованы в 20260907110000–20260907110003; SQL сохранён. Исторические номера в проверках выше относятся к изолированному исходному checkout.

На объединённой версии: 1070 unit tests, 1069 pass, 1 skip; lint 0 errors/101 warnings; typecheck/build pass; 46 миграций на новой тестовой БД и schema diff без расхождений. Отдельно пройдены KHL DB tests и wallet concurrency/settlement test Арены. Старые football fixtures дополнены календарём провайдера.

KHL browser: 9 pass/16 предусмотренных skips. После 55 warm-up и ещё 50 переходов полный heap 8 661 312 → 9 604 204 bytes (+10.89%); snapshots показывают рост V8 compiled code. Проверка удерживаемых JS-данных теперь отдельно исключает code/native: 2 236 184 → 2 236 444 (+260 bytes); порог данных 10%, DOM 852 → 852, listeners 395 → 395. Это изменение методики, а не утверждение о прохождении прежнего лимита общего heap. Worker 5 929 880 → 6 094 168 bytes, максимум 1, после завершения 0; фильтры 5 112 444 → 5 278 928.


## Production 0.3.60 — WI-008, 7 сентября 2026

Реальный каталог Sports.ru 107 включён: сезон 2026/2027, mobile stage 407 / official season 1436, 694 уникальных игрока и 22 клуба. Включены KHL_ENABLED и KHL_SYNC_ENABLED; worker обновляет только этот публичный каталог через fenced jobs каждые 45 секунд после завершения предыдущего цикла. Неподтверждённые calendar/protocol/xG transports не включены. Последний собственный вариант восстанавливается при входе, новый открывается явно.

Одинаковый каталог обновляет freshness без новых receipts/revisions. Production: receipts 2776 сохранялись при нескольких следующих циклах; raw=0, duplicate player/entry groups=0, один повторно используемый QA draft. Число receipts выросло только при первоначальных импортах/перезапусках; кэш содержит не более пяти fingerprint/timestamp пар.

Runtime 15b5a6c9083cf60a292a90f7ef4bf9167c5b0bdd, release 20260907T112939Z-v0.3.60-15b5a6c. Deploy workflow 34116440816 success. Полный CI: 1075 tests pass, lint 0 errors/98 warnings, typecheck/build pass. Production browser workflow 34117242298: auth 1 pass, UI 10 pass/17 skips; реальные KHL catalog/save/reload/return/new-variant и Betting/UCL cases прошли на desktop/tablet/mobile. Skips относятся к отдельным seeded local suites и двум mobile journey cases.

После smoke: web 433.6 MiB, worker 131.3 MiB, PostgreSQL 1.188 GiB; web/worker healthy, restarts=0. Новых миграций нет: 46 применённых миграций, одна прежняя rolled-back audit row, незавершённых 0. Детали Betting/reset и общий release evidence находятся в WI-008.


## Production 0.3.63 — WI-012, 8 сентября 2026

Было: только catalogue/price/lock, 0 player-match и 0 официальных FP. Стало: проверены все 693 активных профиля Sports.ru 107, загружено 1013 player-match (638 PLAYED / 375 DNP), 638 официальных FP, 435 сыгравших игроков и 33 goalie-match. Повторный CLI: imported=0, changed=0, remaining=0; receipts 14259 → 14259, duplicate stat/score groups=0, raw=0 bytes. Один quarantine: Егор Соколов / 2026-09-05 / Спартак, счёт карточки не совпадает с календарём; строка не опубликована. Профили без сыгранных матчей не получают выдуманного среднего нуля.

Контроль production: Грегуар 2026-09-05 — 1250 sec / 7 FP, 2026-09-07 — 1010 sec / 17 FP; Кульбаков 2026-09-07 — 3573 sec / SV33 / GA1 / 15 FP. В истории карточки FP теперь стоят возле конкретного матча вместе с TOI, G/A/+−/PIM или SV/GA. PP/PK TOI и ixG остаются null; полный protocol/xG и forecast readiness не объявлены готовыми.

Worker выполняет ограниченные фоновые партии, первичный CLI завершил 35 партий и освободил свой процесс. Его RSS 206084 → 225180 KiB во время импорта; после завершения дополнительного процесса нет. Итоговые контейнеры: web 491.6 MiB / worker 1.11 GiB / PostgreSQL 957.9 MiB, healthy. Во время импорта параллельно работал существующий отдельный процесс футбольных прогнозов; после его завершения память снизилась. 46 миграций применены, незавершённых 0; схема в этом выпуске не менялась. Локальные QA-файлы 16.2 MB, runtime HTML не кешируется; собственная тестовая PostgreSQL остановлена.

Runtime 28a5427a11c6782f4b31f4eb2d4ceb7a9e6cde2d, release 20260908T075518Z-v0.3.63-28a5427. Deploy workflow 34201405135 success. Локально 1085 unit pass / 1 skip, lint 0 errors / 105 warnings, typecheck/build pass; 3 KHL DB tests pass. Общий DB runner остановлен защитой Betting от чужого имени fixture DB; целевой набор КХЛ выполнен отдельно.

Production browser 34202294303: первоначальный запуск до завершения backfill дал 10 pass / 20 skip / 3 history fail из-за ещё не загруженного контрольного профиля. Повтор после backfill: auth 1 pass, UI 13 pass / 20 предусмотренных skip, включая реальные FP/TOI и отсутствие горизонтального переполнения карточки на desktop/tablet/mobile. Рестарты web/worker: 0.

## Production 0.3.67 — WI-017, 11 сентября 2026

Было: матчевые данные Sports.ru и официальные FP, без времени в атаке/PP/PK и без опубликованного EP. Стало: сезонные суммы из отдельных протоколов, отдельное покрытие каждого поля, PP/PK/атака в каталоге, карточке и истории; семидневный EP с явной маркировкой BETA_BASELINE. Средние последних 5/10/20 матчей сохранены. EP = средние официальные FP × частота участия × реальные будущие игры; это не обученная xG-модель.

На production освежены все 696 активных карточек Sports.ru и загружены 29 протоколов завершённых матчей сезона 2026/2027. В 27 протоколах атака заполнена; 901980/901987 содержат заглушки. Из 1838 player-match атака известна в 959, PP/PK в 1018. Сезонная атака есть у 425 игроков, EP у 496, ixG у 0. Остались 48 различных unlinked имён: не подставлялись по нечёткому сходству. Два старых матча Алистрова дообогатились после точного официального ID из позднего протокола; окончательный повтор 29 файлов changed=0, forecast revision не поменялась.

Контроль Грегуара: 3 матча, TOI 60:04, PP 8:51, PK 2:07, атака 4:25 с покрытием 1/3; EP 16.6667 на два будущих матча. Отсутствие атаки в остальных играх не превращается в ноль. Прямой khl.ru HTTP с production IP возвращает 403; worker сделал одну неуспешную попытку и установил паузу до 2026-09-12T10:39:37.838Z. Новые протоколы не обещаны автоматически до восстановления доступа. Готового player-match ixG feed не найдено, собственная модель не реализована; WI остаётся Blocked.

Runtime dd49fb039e215bddfc0489a8e07c320cd185188c, release 20260911T103306Z-v0.3.67-dd49fb0. [Deploy 34589500218](https://github.com/Tsyzhman/fantasy/actions/runs/34589500218) success: 48 миграций, незавершённых 0; восстановление backup и rehearsal до production. SHA256 backup 86005bff4c3e71f23686f832df572bfdf8f7fbba7fdf367c17850e6479631b26. Health/manifest/OCI обеих служб совпадают, restarts=0.

Локально npm run check: 1090 pass / 1 skip, lint 0 errors / 117 warnings, typecheck/build pass; focused PostgreSQL test дополнительно проверяет конкурентную запись Sports.ru/КХЛ. UI проверен на desktop/390px, overflow=0, duplicate DOM IDs=0. [Production browser 34590394503](https://github.com/Tsyzhman/fantasy/actions/runs/34590394503): auth pass, 19 UI pass / 20 skip / 3 fail; все KHL-сценарии прошли на desktop/tablet/mobile, три прежних failure относятся к Betting UCL model и воспроизводились до выпуска.

Дубли stat/raw/active jobs=0. Raw 29 строк / 99987 bytes, read cache=0, 4 forecast revisions; финальные web 293.2 MiB / worker 462.9 MiB / PostgreSQL 1.033 GiB, свободно 86 GiB. Временный локальный сайт и PostgreSQL остановлены, созданная тестовая учётная запись/сессия удалены. Полное production evidence хранится в Result [WI-017](../specs/work/WI-017-khl-protocol-statistics.md).
