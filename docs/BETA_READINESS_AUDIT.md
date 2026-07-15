# Beta Readiness Audit

Дата проверки: 2026-07-15.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. Финальный проверенный production runtime:
`fantasy-scout-web:beta23-20260715T204137Z`, image ID
`sha256:311bd2f61fc8cb0f4fa4cc0afc20d2999e9615380c37a291ec023697f618a5b5`.

## Итог

Полноценная beta пока не готова. Технический путь от поиска игрока до
сохранённого оптимизированного состава работает в production, правила EPL и
бюджет проверяются на сервере, прогнозное покрытие превышает SMART-порог 98%,
автоподбор и трансферы работают, desktop/mobile acceptance и основные пороги
скорости пройдены. Исторический пяти-туровый backtest завершён и сохранён.

Релиз блокируют факты, которые кодом задним числом закрыть нельзя:

1. официальный Sports.ru GraphQL возвращает `currentSeason: null`, поэтому
   официальных цен 0 и планировщик использует 629 явно помеченных оценочных цен;
2. историческая raw→normalized latency не доказуема: coverage 0%, хотя новые raw
   timestamps теперь сохраняются для будущего измерения;
3. не подключён внешний получатель alert-уведомлений;
4. не проведён тест минимум на 10 реальных пользователях с completion rate ≥80%;
5. mixed load-smoke теперь воспроизводим, но нет длительного RUM и beta error
   rate за период работы реальной тестовой группы;
6. мобильный, keyboard и автоматизированный a11y acceptance выполнены в Edge,
   но не на реальных Safari iOS и Chrome Android.

Статус `частично` ниже не означает готовность. Критерий закрывается только
прямым проверяемым доказательством всего заявленного объёма.

## Сводка по Definition of Done

| # | Критерий | Статус | Проверенное доказательство | Что блокирует полное закрытие |
|---|---|---|---|---|
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Production-поиск `Mbeumo` вернул Bryan Mbeumo и прогноз за 507 мс; `Build squad` ведёт в EPL 2026/2027. QA-вариант `cmrm8rrsd0001me4e8okeccii` сохранён и после reload восстанавливается без изменений: 15/15, старт 11/11, скамейка 4/4, бюджет 100/100 | Массовая понятность этого пути проверяется отдельно критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для проверенного EPL-контура | Сервер заменяет клиентские цены авторитетными значениями и повторно проверяет бюджет, позиции, схему, клубный лимит, старт/скамейку, капитана и трансферные ограничения. Сохранённый состав допустим, бюджет 100/100, банк 0; unit-тесты отклоняют недопустимые варианты | Правила других fantasy-турниров нельзя считать проверенными без их отдельной матрицы и acceptance |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production audit `cmrm6rs0e0000c1rsq7g4mycz`: 582/590 = 98,644%. Текущий сезонный пул: 619 прогнозов на 629 игроков = 98,41%, выше SMART-порога 98% | Общий data-quality health остаётся 503 только из-за недоказанной исторической latency, не из-за forecast coverage |
| 4 | Автоподбор и трансферы работают на реальных данных | Частично | Реальные FotMob-команды, игроки, статистика, 380 матчей и 38 туров используются моделью. Автоподбор production — 2,903 с. На beta22 показаны допустимые трансферные планы; unit-замер на пуле 500 — около 1,7–1,9 с | Реальных текущих Sports.ru-цен нет; бюджетная часть использует оценочные цены, поэтому критерий `на реальных данных` целиком не выполнен |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Production Edge beta22: desktop 1440×900 и mobile 390×844, root/body overflow 0. Squad/Pool/Tips переключаются мышью и стрелками с roving focus; все 3 nav-landmark имеют имена; console errors/warnings 0. Axe-проверка того же UI на beta21 дала 0 нарушений desktop/mobile | Нет проверки на реальных iOS/Android-устройствах и постоянного E2E/visual-regression набора |
| 6 | Выполнены показатели скорости | Частично только из-за beta-period | Короткий production beta22 mixed-smoke: 40/40 HTTP 200, 5 concurrent, SSR p75 369 мс, pool p75 238 мс. Длинный beta17-профиль: 0/1 362 ошибок, SSR/pool p75 352/85 мс. Поиск/фильтр 649/637 мс, browser-пересчёт p75 552 мс, автоподбор 2,903 с, трансферы p75 581 мс — все установленные лимиты пройдены | Нет длительного RUM/Web Vitals и server error rate за период работы реальной beta-группы; короткий load-smoke не подменяет этот показатель |
| 7 | Отсутствуют критические ошибки | Частично | Финальный `npm run check`: 254/254 теста, lint, typecheck и production build. Production dependencies: 0 уязвимостей. Desktop/mobile acceptance: console errors/warnings 0. Контейнер beta23 healthy, 0 рестартов; целевой beta23-контракт 7/7, canary log errors 0. До promotion beta22 обнаружено насыщение PostgreSQL старыми canary 100/100; production не затронут, после beta23 cleanup — 8/100 | Короткий acceptance не доказывает отсутствие критических дефектов в длительном закрытом beta-тесте и под нагрузкой |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco` завершён `COMPLETED`, 380/380 матчей EPL 2025/2026, `gate_passed=true`. Улучшение пяти-турового RMSE: GK 16,569%, DEF 10,759%, MID 13,403%, FWD 11,116% | Одноматчевый горизонт отдельно не достиг 10%; результат заявлен только для проверенного пяти-турового планирования |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | В production применена 000006, работают `/beta-test`, bounded telemetry API и обезличенный report. Синтетический прогон записал 8 этапов, 2 page views, 10 Web Vitals и 0 client errors; report: 1 synthetic, 0 real, 0 participants, gate FAIL. Synthetic навсегда исключён из пользовательского gate | Нет минимум 10 реальных участников, completion rate ≥80%, нахождения прогноза ≥80%, понимания трансфера ≥70% и средней оценки UI ≥4/5 |
| 10 | Мониторинг, логи и контроль обновления данных | Частично | `/api/health` = 200; отдельные data-quality и fantasy-price health endpoints корректно возвращают 503. Есть structured logs, расписания, retry, persisted audit, raw timestamps и bounded beta telemetry. Scheduler сохранил старые данные и назначил повтор после `currentSeason: null` | Data-quality red из-за latency coverage 0%; price health red из-за 0 официальных цен; внешний канал доставки alert не подключён |

## Production browser и скорость

- Поиск игрока: HTTP 200, 507 мс, Bryan Mbeumo и прогноз отображаются, ссылка в
  планировщик корректна.
- Сохранённый вариант: `My squad`, ID `cmrm8rrsd0001me4e8okeccii`, EPL `47`,
  сезон `2026/2027`, 15/15, 11/4, бюджет 100/100, банк 0.
- На beta22 после клиентской загрузки доступны 629 оценочных цен, полный API-пул,
  round forecast и блок transfer suggestions.
- Mobile 390×844: Squad, Pool и Tips переключаются кликом и стрелками;
  document/body overflow 0; console errors/warnings 0.
- Desktop 1440×900: document/body overflow 0, три navigation-landmark имеют
  доступные имена; console errors/warnings 0. Старый preload warning устранён.
- `/machete/squad`, 10 авторизованных загрузок: 343, 379, 383, 393, 399, 435,
  449, 480, 2 280 и 2 439 мс; p75 480 мс, p95 2 439 мс, 10/10 HTTP 200.
- `/api/health`, 20 HTTPS-запросов: p75 121,9 мс, p95 203,6 мс, максимум
  203,7 мс, ошибок 0.
- Смена горизонта, 10 browser-переключений: summary p75/p95 552/585 мс;
  трансферные рекомендации p75/p95 581/603 мс; console errors 0.
- Mixed load beta17, 5 concurrent на 60 секунд: 1 362 запроса, 0 ошибок; SSR p75
  352 мс, pool API p75 85 мс. После прогона production был healthy, restart
  count 0, новых error-логов не появилось. Единственный structured warn —
  известный Sports.ru `currentSeason: null`.
- Короткий mixed-smoke beta22 на canary и production: по 40 авторизованных
  запросов, concurrency 5, ошибок 0. Production SSR p75/p95 369/678 мс; pool API
  p75/p95 238/3 102 мс. После удаления canary production остался healthy,
  рестартов 0, соединения PostgreSQL 24/100.
- Для сравнения beta16 при том же профиле дал SSR/pool p75 2 308/5 461 мс.
  Beta17 использует ограниченный 30-секундный process cache общего player pool и
  объединяет одновременные cache miss; user squads не кэшируются.

Verifier `npm run beta:load` и профиль описаны в `docs/BETA_LOAD_TEST.md`. Эти
замеры подтверждают технический load-smoke, но не заменяют длительный RUM/Web
Vitals и error rate за период реального beta-тестирования.

## Данные и модель

- Production rollover EPL: сезон `2026/2027`, 20 команд, 380 будущих матчей,
  даты 2026-08-21—2027-05-30, 38 туров по 10 матчей.
- Текущий прогнозный пул: 619/629 = 98,41%.
- Официальных Sports.ru-цен 0. `/api/health/fantasy-prices` возвращает 503,
  потому что официальный источник не публикует `currentSeason`.
- Production data-quality run `cmrm6rs0e0000c1rsq7g4mycz`: forecast 98,644%,
  player 98,644%, match 100%, stat rows 99,967%, latency 0%; `gate_passed=false`
  только из-за latency.
- Latency 0% означает не медленную обработку, а отсутствие старых raw ingestion
  timestamps. Raw payload timestamps сохраняются для будущих измерений;
  историческое доказательство задним числом не выдумывается.

## Production deployment

- Перед 000006 создан dump
  `/var/backups/fantasy-scout/fantasy_scout_pre_beta21_20260715T194036Z.dump`,
  50 192 471 байт, SHA-256
  `ecefcd3b325643b1f6d66de7d62b0dc00446b35f8516e3c847d4a5ce0e9aa4ba`;
  каталог `pg_restore`, таблицы и данные проверены.
- Применены миграции 000003–000006; 6/6 записей applied, failed/rolled back 0.
- Активен образ `fantasy-scout-web:beta23-20260715T204137Z` из release-dir
  `/var/www/fantasy-scout-releases/20260715T204137Z-beta23-pending-reviews`,
  `running|healthy|0`.
- Немедленный rollback перед beta23:
  `fantasy-scout-web-rollback-pre-beta23-20260715T204137Z`, образ beta22
  `sha256:0b26738919f6638772749634f07d3acdf69c70baeb2ee1fb6cd322ef26ba18d5`,
  остановлен и сохранён.
- Beta23-замена использовала заранее созданный остановленный кандидат, точные
  image/health preconditions и автоматический rollback; HTTP восстановился за
  2 011 мс, весь swap+health занял 6 575 мс. Canary удалён после целевого
  report/HTTP acceptance, PostgreSQL — 8/100 подключений.
- При первой попытке rollout beta14 скрипт с ошибкой CRLF/quoting остановил и
  переименовал прежний контейнер до сбоя запуска. Production был недоступен
  примерно 30–40 секунд, затем beta10 немедленно восстановлен. Потери данных не
  было. После инцидента схема выкладки изменена на pre-created candidate и
  syntax-check до остановки активного контейнера.
- Рабочая копия `/var/www/fantasy-scout` содержит чужие/незакоммиченные изменения
  и намеренно не перезаписывалась. Runtime закреплён отдельным release-dir и
  Docker image; `docker compose up --build` из старой checkout запрещён до
  нормального слияния.

## Обязательные следующие действия

1. После появления Sports.ru `currentSeason` получить валидный snapshot минимум
   из 100 официальных цен, mapping ≥98% и добиться HTTP 200 у price health.
2. Накопить raw→normalized timestamps и получить persisted audit с latency
   coverage 100%, временем ≤6 часов и общим `gate_passed=true`.
3. Подключить внешний uptime/log alert destination и подтвердить доставку
   тестовой тревоги для обоих отдельных 503 health-сигналов.
4. Провести протокол минимум на 10 реальных пользователях и выполнить все UX
   пороги SMART-плана.
5. Запустить длительный сбор beta server error rate <1% и RUM/Web Vitals на
   реальной тестовой группе. Короткий beta22 load-smoke даёт SSR/pool p75
   369/238 мс, но не заменяет метрики за реальный период.
6. Проверить реальные Safari iOS/Chrome Android и добавить постоянный
   E2E/visual regression suite; автоматизированные Edge keyboard/a11y checks
   уже пройдены.
