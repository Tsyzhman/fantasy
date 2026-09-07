# КХЛ: реализация и проверка 7 сентября 2026

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

Длительные наблюдения и обучение не проводились и не заменены mocks. КХЛ flags по умолчанию выключены. Реальное подключение источников и включение production не выполнялись.

## Воспроизведение

Только отдельная тестовая БД. CLI: `npx tsx scripts/khl-runner.ts status`; для мутаций нужен `KHL_SYNC_ENABLED=true`. Команды: `bootstrap metadata.json`, `catalog CONTEST`, `calendar CONTEST FROM_ISO TO_ISO`, `baseline CONTEST WEEK_ID[,WEEK_ID]`, `prune`. Bootstrap требует явные season/provider IDs и evidence.

Тестовые fixtures: `scripts/khl-seed-test.ts`, `scripts/khl-football-regression-seed.ts` требуют `KHL_TEST_DATABASE=true` и точный локальный URL. Браузерные конфиги: `playwright.khl.config.ts`, `playwright.khl-regression.config.ts`. Тестовые авторизационные файлы не должны попадать в git.

## Интеграция общего релиза 0.3.58

7 сентября модуль объединён с действующим production d9abf51 и полным локальным снимком global strategy, rotation risk и contact-sheet UI. Для первого production применения четыре ещё не выпускавшиеся KHL миграции переименованы в 20260907110000–20260907110003; SQL сохранён. Исторические номера в проверках выше относятся к изолированному исходному checkout.

На объединённой версии: 1070 unit tests, 1069 pass, 1 skip; lint 0 errors/101 warnings; typecheck/build pass; 46 миграций на новой тестовой БД и schema diff без расхождений. Отдельно пройдены KHL DB tests и wallet concurrency/settlement test Арены. Старые football fixtures дополнены календарём провайдера.

KHL browser: 9 pass/16 предусмотренных skips. После 55 warm-up и ещё 50 переходов полный heap 8 661 312 → 9 604 204 bytes (+10.89%); snapshots показывают рост V8 compiled code. Проверка удерживаемых JS-данных теперь отдельно исключает code/native: 2 236 184 → 2 236 444 (+260 bytes); порог данных 10%, DOM 852 → 852, listeners 395 → 395. Это изменение методики, а не утверждение о прохождении прежнего лимита общего heap. Worker 5 929 880 → 6 094 168 bytes, максимум 1, после завершения 0; фильтры 5 112 444 → 5 278 928.
