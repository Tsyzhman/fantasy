# Beta Readiness Audit

Дата проверки: 2026-07-16.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta31 clean-UI promote:

- image `fantasy-scout-web:beta31-20260716T133614Z`;
- image ID
  `sha256:61d5c13fb55df2723da311fea40bf5a845e72f79798a7fb7518e10ef1565ed4a`;
- source commit `20bea7b14c824a572c76722491074148343f4451`;
- release
  `/var/www/fantasy-scout-releases/20260716T133614Z-beta31-20bea7b-green-main`;
- active container ID
  `380c0d541dc7f9648036505c1e0a559818fc527bff28c3013935bc8f811674b4`;
- состояние `running|healthy|0`, внешние `/api/health` и
  `/api/health/data-quality` — HTTP 200;
- web и PostgreSQL container logs: `json-file`, `max-size=20m`,
  `max-file=5`;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`,
  тот же image ID
  `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229`
  и тот же volume `fantasy-scout_fantasy-scout-postgres`;
- beta30 сохранён остановленным immediate rollback-контейнером
  `fantasy-scout-web-beta30-rollback-20260716T134325Z`.

Перед promote beta31 проверен отдельно на loopback canary:

- image `fantasy-scout-web:beta31-20260716T133614Z` с тем же точным image ID;
- ingestion worker отключён, upload volume read-only;
- целевой responsive suite на 1440×1000, 1024×900 и Pixel 5 дал 4/4 passed;
- production browser workflow `29503570431` дал 5 passed и 2 expected skipped,
  а monitor `29503572684` — 0 critical и 0 warning;
- loopback HTTP восстановлен за 1,862 секунды; после acceptance временные
  canary/candidate-контейнеры удалены.

## Итог

Полноценная beta пока не доказана. Технический путь от поиска игрока до
сохранения валидного автосостава работает, прогнозное покрытие выше 98%,
пяти-туровый backtest пройден, установленные короткие performance-пороги
выполнены. Отдельная clean-UI правка `/machete/squad` реализована и проверена на
desktop, tablet и mobile; это закрывает технический и визуальный UI-gate, но не
заменяет проверку понятности интерфейса реальными пользователями.
На сервере включены ротация Caddy access log, 15-минутный
агрегированный аудит 5xx/latency и публичный обезличенный health snapshot.
После реального последовательного refresh 380 матчей production data-quality
gate проходит, включая 100% raw→normalized latency coverage.

Оставшиеся блокеры:

1. нет минимум 10 реальных участников и доказанного completion rate ≥80%;
2. нет проверки на физических Safari iOS и Chrome Android;
3. нет длительного RUM/Web Vitals и server error rate за период реальной beta.

## Сводка по Definition of Done

| # | Критерий | Статус | Проверенное доказательство | Что ещё требуется |
|---|---|---|---|---|
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Новый Playwright-сценарий авторизуется, получает реальный forecast pool, находит прогнозируемого игрока в каталоге, запускает `Auto-pick squad`, видит `Valid squad`, сохраняет именованный вариант, подтверждает его через выбранный server-returned `squadId` и удаляет QA-копию | Понятность пути для аудитории доказывается критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для EPL-контура | Сервер заново загружает авторитетный pool и проверяет размер, позиции, схему старта, скамейку, клубный лимит, бюджет, капитана и transfer limit. UI-save принимается только после `Valid squad`; unit-тесты отклоняют недопустимые payload | Отдельная rule-matrix потребуется при добавлении других fantasy-турниров |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production run `cmrndxcnu000010km2tdjbsis`: forecast coverage 745/753 = 98,938%, player coverage 98,938%, match coverage 380/380 = 100%, stat-row coverage 99,967%, общий gate PASS | Продолжать ежедневный fail-closed audit на новых данных |
| 4 | Автоподбор и трансферы работают на реальных данных | Выполнено в согласованном объёме без официальных цен | Игроки, команды, статистика, матчи и прогнозы берутся из production FotMob-контура. UI автоподбор создаёт допустимый состав; transfer suggestions рассчитаны по реальному pool и прогнозам | Официальные цены явно отложены владельцем продукта; оценочные цены не выдаются за официальные |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta31 workflow `29503570431` проверил Chromium на 1440×1000, 1024×900 и Pixel 5: 5 passed, 2 expected skipped. Нет page-level horizontal overflow; на 1024 доступна вкладка Pool; mobile/tablet menu содержит навигацию и sign-out; активная mobile-вкладка `Squad` целиком видна; screenshots сохранены в artifact `8377527685` | Нужны physical Safari iOS/Chrome Android; понятность пути для аудитории проверяется критерием 9 |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Исторические production замеры проходят SMART-пороги: squad SSR p75 480 мс, client summary p75 552 мс, автоподбор 2,903 с, transfer suggestions p75 581 мс. Последний Caddy audit: 233 запроса, 0 5xx, p75 90,092 мс, p95 389,196 мс. Beta31 собирает opt-in RUM и требует LCP минимум от 10 реальных участников, p75 ≤2,5 с; pending/invalid/failed прогоны нельзя исключить модерацией | Сейчас реальных RUM-участников 0; нужна фактическая beta-выборка |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 261/261 unit/integration, lint, typecheck, production build; production dependencies — 0 vulnerabilities. Main CI `29502617657` полностью green; beta31 browser run `29503570431` green; beta31 healthy, 0 рестартов. Два старых Caddy upstream EOF дали 502, но 100-request probe воспроизвести их не смог и app error log пуст | Короткий acceptance и невоспроизведённые транзиенты не доказывают длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и защищённый `/admin/beta-test` для обезличенного moderator review готовы; synthetic evidence исключается из human/RUM gates, запросы идемпотентны, а RUM использует все реальные прогоны без выборочного удаления неудобных результатов | Сейчас 0 доказанных реальных участников; нужны ≥10, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; warning-health исключены из user error-rate; public aggregate работает; app и PostgreSQL logs ограничены 5×20 MiB. Реальный refresh `1` дал 380/380 fetched, 0 failed; audit `cmrndxcnu000010km2tdjbsis` дал latency 100% и PASS; оба health endpoint возвращают 200. Monitor `29503572684` green: 0 critical, 0 warning, data-quality PASS, access audit 233 запроса и 0 5xx | Поддерживать monitor и ежедневный fail-closed data-quality audit в beta |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически и визуально | В beta31 убраны дублирующий Machete hero, breadcrumbs и большая intro-card; tools свёрнуты, метрики собраны в strip, workbench поднят выше transfer tips, mobile-таблица заменена карточками. Пустой состав больше не назван valid, Save отключён до допустимых 15/11/4, а активная `Squad` целиком видна на 360 px. Canary 4/4 и production workflow `29503570431` 5 passed/2 skipped; screenshots просмотрены на 1440, 1024 и Pixel 5 | Субъективную понятность и оценку ≥4/5 всё ещё должны подтвердить реальные участники в критерии 9 |

## Clean-UI gate `/machete/squad` — закрыт технически и визуально

Правки beta29–beta31 устранили конкретные пересечения, breakpoint-дефекты и
визуальный шум. Автоматическая геометрия дополнена ручным просмотром production
screenshots; пользовательская понятность остаётся отдельным human gate.

До правки:

- страница повторяла global header отдельным Machete hero, breadcrumbs и intro-card;
- import/export/admin tools постоянно конкурировали с основным сценарием;
- метрики были набором равнозначных карточек, а transfer tips шли до workbench;
- на мобильном пул оставался широкой 760 px таблицей;
- пустой состав показывал `Valid squad`, позволял Save и смешивал EN/RU в option;
- при 360 px служебная подпись сдвигала активную `Squad` за край subnav.

После правки:

- compact workspace nav и заголовок заменили три повторяющихся intro-блока;
- data tools свёрнуты, метрики собраны в одну полосу, workbench расположен до tips;
- основная иерархия — `Auto-pick squad`, `Save squad`, затем `More actions`;
- mobile pool использует читаемые карточки, desktop сохраняет таблицу;
- пустой состав честно показывает `15 players needed`, Save заблокирован до
  полного допустимого состава, option отображается на одном языке;
- на 360 px скрыта только избыточная подпись workspace, поэтому `Leagues`,
  `Players` и активная `Squad` видны целиком;
- production workflow `29503570431` сохранил 0 document overflow и полный путь
  search → auto-pick → valid → save → cleanup.

## Мониторинг и логи

- Caddy `v2.11.3` пишет `/var/log/caddy/fantasy-access.log` от `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live app и PostgreSQL containers используют `json-file` 5×20 MiB.
  PostgreSQL контролируемо пересоздан с тем же image/env/network/volume:
  до и после переключения подтверждены 7 миграций и 10 971 строка `matches`,
  затем web и оба публичных health endpoint вернулись в healthy/HTTP 200.
- Проверенный отчёт после beta31 promote: 233 user-traffic запроса, 0 5xx,
  server error rate 0%, p75 90,092 мс, p95 389,196 мс.
- `/_monitor/*` и warning-only data-quality/price health endpoints исключены из
  user-traffic метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Run `29503572684`: critical failures 0, warnings 0, data-quality PASS,
  access audit `ok`;
  ранее открытый issue `#1` остаётся закрыт.
- Официальные цены намеренно не входят в monitor до появления источника.

## Обязательные следующие действия

1. Провести протокол минимум на 10 реальных пользователях и выполнить все UX
   пороги SMART-плана.
2. Собрать длительный RUM/Web Vitals и server error rate <1% на реальной группе.
3. Проверить физические Safari iOS и Chrome Android.
4. Продолжать triage двух наблюдавшихся upstream EOF, если они повторятся в
   следующих часовых окнах; не закрывать длительный error-rate gate по одной
   короткой выборке.
5. После появления официальных цен вернуть price gate в обязательный объём; до
   этого не выдавать оценочные цены за официальные.
