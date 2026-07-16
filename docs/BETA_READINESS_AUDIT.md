# Beta Readiness Audit

Дата проверки: 2026-07-16.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta28 moderator-dashboard promote:

- image `fantasy-scout-web:beta28-20260716T121415Z`;
- image ID
  `sha256:1f2835ff90616fdc10915bd41dad67fb599e0a09089fbf096f69d167a9aa6ed0`;
- source commit `1f0ed07bf21dfbcef618cff81b909bb06c631808`;
- release
  `/var/www/fantasy-scout-releases/20260716T121415Z-beta28-1f0ed07-green-main`;
- состояние `running|healthy|0`, внешние `/api/health` и
  `/api/health/data-quality` — HTTP 200;
- web и PostgreSQL container logs: `json-file`, `max-size=20m`,
  `max-file=5`;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`,
  тот же image ID
  `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229`
  и тот же volume `fantasy-scout_fantasy-scout-postgres`;
- beta27 сохранён остановленным rollback-контейнером
  `fantasy-scout-web-beta27-rollback-20260716T121415Z`.

Перед promote beta28 проверен отдельно на loopback canary:

- image `fantasy-scout-web:beta28-20260716T121415Z` с тем же точным image ID;
- ingestion worker отключён, upload volume read-only;
- loopback health и data-quality — HTTP 200; `/admin/beta-test` без сессии не
  содержит dashboard и отдаёт streamed redirect на login;
- после успешного production smoke временные canary/candidate-контейнеры удалены.

## Итог

Полноценная beta пока не доказана. Технический путь от поиска игрока до
сохранения валидного автосостава работает, прогнозное покрытие выше 98%,
пяти-туровый backtest пройден, установленные короткие performance-пороги
выполнены. Геометрические browser-проверки `/machete/squad` проходят, но это не
закрывает clean-UI gate: владелец продукта прямо оценивает экран как перегруженный.
На сервере включены ротация Caddy access log, 15-минутный
агрегированный аудит 5xx/latency и публичный обезличенный health snapshot.
После реального последовательного refresh 380 матчей production data-quality
gate проходит, включая 100% raw→normalized latency coverage.

Оставшиеся блокеры:

1. не выполнена отдельная UI-чистка ключевых экранов, прежде всего
   `/machete/squad`, с повторной проверкой на 360–393, 1024 и 1440 px;
2. нет минимум 10 реальных участников и доказанного completion rate ≥80%;
3. нет проверки на физических Safari iOS и Chrome Android;
4. нет длительного RUM/Web Vitals и server error rate за период реальной beta.

## Сводка по Definition of Done

| # | Критерий | Статус | Проверенное доказательство | Что ещё требуется |
|---|---|---|---|---|
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Новый Playwright-сценарий авторизуется, получает реальный forecast pool, находит прогнозируемого игрока в каталоге, запускает `Auto-pick squad`, видит `Valid squad`, сохраняет именованный вариант, подтверждает его через выбранный server-returned `squadId` и удаляет QA-копию | Понятность пути для аудитории доказывается критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для EPL-контура | Сервер заново загружает авторитетный pool и проверяет размер, позиции, схему старта, скамейку, клубный лимит, бюджет, капитана и transfer limit. UI-save принимается только после `Valid squad`; unit-тесты отклоняют недопустимые payload | Отдельная rule-matrix потребуется при добавлении других fantasy-турниров |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production run `cmrndxcnu000010km2tdjbsis`: forecast coverage 745/753 = 98,938%, player coverage 98,938%, match coverage 380/380 = 100%, stat-row coverage 99,967%, общий gate PASS | Продолжать ежедневный fail-closed audit на новых данных |
| 4 | Автоподбор и трансферы работают на реальных данных | Выполнено в согласованном объёме без официальных цен | Игроки, команды, статистика, матчи и прогнозы берутся из production FotMob-контура. UI автоподбор создаёт допустимый состав; transfer suggestions рассчитаны по реальному pool и прогнозам | Официальные цены явно отложены владельцем продукта; оценочные цены не выдаются за официальные |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta28 workflow `29498125902` проверил Chromium на 1440×1000, 1024×900 и Pixel 5: 5 passed, 2 expected skipped. Нет page-level horizontal overflow; на 1024 доступна вкладка Pool; mobile/tablet menu содержит навигацию и sign-out; `Ctrl+K` открывает ровно одну палитру; screenshots сохранены в artifact `8375283390` | Нужны physical Safari iOS/Chrome Android и отдельная UI-чистка, потому что зелёная геометрия не доказывает понятность экрана |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Исторические production замеры проходят SMART-пороги: squad SSR p75 480 мс, client summary p75 552 мс, автоподбор 2,903 с, transfer suggestions p75 581 мс. Текущий Caddy audit: 265 запросов, 0 5xx, p75 66,689 мс, p95 267,551 мс. Beta28 собирает opt-in RUM и требует LCP минимум от 10 реальных участников, p75 ≤2,5 с; pending/invalid/failed прогоны нельзя исключить модерацией | Сейчас реальных RUM-участников 0; нужна фактическая beta-выборка |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 261/261 unit/integration, lint, typecheck, production build; production dependencies — 0 vulnerabilities. Main CI `29497070748` полностью green; beta28 browser run `29498125902` green; beta28 healthy, 0 рестартов. Два старых Caddy upstream EOF дали 502, но 100-request probe воспроизвести их не смог и app error log пуст | Короткий acceptance и невоспроизведённые транзиенты не доказывают длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и защищённый `/admin/beta-test` для обезличенного moderator review готовы; synthetic evidence исключается из human/RUM gates, запросы идемпотентны, а RUM использует все реальные прогоны без выборочного удаления неудобных результатов | Сейчас 0 доказанных реальных участников; нужны ≥10, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; warning-health исключены из user error-rate; public aggregate работает; app и PostgreSQL logs ограничены 5×20 MiB. Реальный refresh `1` дал 380/380 fetched, 0 failed; audit `cmrndxcnu000010km2tdjbsis` дал latency 100% и PASS; оба health endpoint возвращают 200. Monitor `29498123711` green: 0 critical, 0 warning, data-quality PASS, access audit 265 запросов и 0 5xx | Поддерживать monitor и ежедневный fail-closed data-quality audit в beta |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Не выполнено | Browser-smoke доказывает отсутствие измеримого overflow и пересечений, но не визуальную ясность. Владелец продукта сообщает, что UI часто остаётся «полным хламом», особенно `/machete/squad` | Провести отдельную чистку и визуальный review на 360–393, 1024 и 1440 px: убрать шум/дубли, выделить основное действие, сгруппировать вторичные настройки |

## Предыдущая техническая UI-cleanup — новый clean-UI gate не закрыт

Перечисленные ниже правки устранили конкретные пересечения и breakpoint-дефекты,
но итоговый экран всё ещё оценивается владельцем как перегруженный. Поэтому этот
раздел является историей выполненных исправлений, а не доказательством готовности UI.

До правки:

- selector варианта, имя и действия пересекались на desktop;
- шесть transfer cards повторяли одно предупреждение;
- до состава шёл длинный ряд равнозначных настроек;
- на ширине 1024–1279 mobile tabs уже исчезали, а desktop pool ещё не появлялся;
- mobile workspace и global header обрезали навигацию.

После правки:

- `Save squad` имеет главный приоритет, auto-pick остаётся рядом, редкие действия
  находятся в `More actions`;
- strategy/horizon/transfers/prices находятся в свёрнутом `Planning settings`;
- предложения показывают top 3 с явным `Show all`, общее предупреждение — один
  раз, карточки не повторяют его;
- breakpoint tabs/pool выровнен на `xl`, поэтому tablet 1024 имеет Pool;
- workspace nav на телефоне — компактная сетка, global utilities — в Menu;
- mobile и desktop header используют один экземпляр navigation utilities, поэтому
  `Ctrl+K` больше не создаёт два диалога;
- rule status (`Valid squad`/issues) виден рядом с summary.

## Мониторинг и логи

- Caddy `v2.11.3` пишет `/var/log/caddy/fantasy-access.log` от `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live app и PostgreSQL containers используют `json-file` 5×20 MiB.
  PostgreSQL контролируемо пересоздан с тем же image/env/network/volume:
  до и после переключения подтверждены 7 миграций и 10 971 строка `matches`,
  затем web и оба публичных health endpoint вернулись в healthy/HTTP 200.
- Проверенный отчёт после beta28 promote: 265 user-traffic запросов, 0 5xx,
  server error rate 0%, p75 66,689 мс, p95 267,551 мс.
- `/_monitor/*` и warning-only data-quality/price health endpoints исключены из
  user-traffic метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Run `29498123711`: critical failures 0, warnings 0, data-quality PASS,
  access audit `ok`;
  ранее открытый issue `#1` остаётся закрыт.
- Официальные цены намеренно не входят в monitor до появления источника.

## Обязательные следующие действия

1. Провести отдельную UI-чистку `/machete/squad` и повторный visual review на
   360–393, 1024 и 1440 px.
2. Провести протокол минимум на 10 реальных пользователях и выполнить все UX
   пороги SMART-плана.
3. Собрать длительный RUM/Web Vitals и server error rate <1% на реальной группе.
4. Проверить физические Safari iOS и Chrome Android.
5. Продолжать triage двух наблюдавшихся upstream EOF, если они повторятся в
   следующих часовых окнах; не закрывать длительный error-rate gate по одной
   короткой выборке.
6. После появления официальных цен вернуть price gate в обязательный объём; до
   этого не выдавать оценочные цены за официальные.
