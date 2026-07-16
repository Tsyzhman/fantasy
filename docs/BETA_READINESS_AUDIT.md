# Beta Readiness Audit

Дата проверки: 2026-07-16.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta26 data-quality promote:

- image `fantasy-scout-web:beta26-20260716T101422Z`;
- image ID
  `sha256:c431d2687922003af410f17408f4a74ff695a510d0cd7e99d3605e5b81919f52`;
- source commit `e739e75310736cbecff7d0bd4fc4fd5c8374091c`;
- release
  `/var/www/fantasy-scout-releases/20260716T101422Z-beta26-e739e75-green-main`;
- состояние `running|healthy|0`, внешние `/api/health` и
  `/api/health/data-quality` — HTTP 200;
- web и PostgreSQL container logs: `json-file`, `max-size=20m`,
  `max-file=5`;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`,
  тот же image ID
  `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229`
  и тот же volume `fantasy-scout_fantasy-scout-postgres`;
- beta25 сохранён остановленным rollback-контейнером.

Перед promote тот же UI проверен отдельно на loopback canary:

- image `fantasy-scout-web:ui-canary-v4-20260716T090327Z`;
- image ID
  `sha256:d268da9f88cf3c25e2ef0d3db4871462abab975e5cb86462530143fa04763b5d`;
- ingestion worker отключён, upload volume read-only;
- Playwright: 5 passed, 2 ожидаемо skipped; полный изменяющий данные сценарий
  запускается один раз на desktop, responsive-проекты остаются read-only.
- после успешного production smoke временные canary/candidate-контейнеры удалены.

## Итог

Полноценная beta пока не доказана. Технический путь от поиска игрока до
сохранения валидного автосостава работает, прогнозное покрытие выше 98%,
пяти-туровый backtest пройден, установленные короткие performance-пороги
выполнены. UI `/machete/squad` очищен и автоматически проверен на desktop,
tablet и mobile. На сервере включены ротация Caddy access log, 15-минутный
агрегированный аудит 5xx/latency и публичный обезличенный health snapshot.
После реального последовательного refresh 380 матчей production data-quality
gate проходит, включая 100% raw→normalized latency coverage.

Оставшиеся блокеры нельзя честно закрыть локальным тестом:

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
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta26 workflow `29492135480` проверил Chromium на 1440×1000, 1024×900 и Pixel 5: 5 passed, 2 expected skipped. Нет page-level horizontal overflow; на 1024 доступна вкладка Pool; mobile/tablet menu содержит навигацию и sign-out; `Ctrl+K` открывает ровно одну палитру; screenshots сохранены в artifact `8372895542` | Нужны физические Safari iOS и Chrome Android |
| 6 | Выполнены показатели скорости | Частично только из-за beta-period | Исторические production замеры проходят SMART-пороги: squad SSR p75 480 мс, client summary p75 552 мс, автоподбор 2,903 с, transfer suggestions p75 581 мс. Текущий часовой Caddy audit: 523 запроса, 5xx 0,382%, p75 63,831 мс, p95 254,644 мс | Нужны длительные RUM/Web Vitals и error rate реальной группы |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 259/259 unit/integration, lint, typecheck, production build; production dependencies — 0 vulnerabilities. Main CI `29489821967` полностью green; beta26 browser run `29492135480` green; beta26 healthy, 0 рестартов. Два старых Caddy upstream EOF дали 502, но 100-request probe воспроизвести их не смог и app error log пуст | Короткий acceptance и невоспроизведённые транзиенты не доказывают длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и обезличенный moderator report готовы; synthetic evidence исключается из human gate | Сейчас 0 доказанных реальных участников; нужны ≥10, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; warning-health исключены из user error-rate; public aggregate работает; app и PostgreSQL logs ограничены 5×20 MiB. Реальный refresh `1` дал 380/380 fetched, 0 failed; audit `cmrndxcnu000010km2tdjbsis` дал latency 100% и PASS; оба health endpoint возвращают 200. Monitor `29492135499` green и закрыл issue `#1` | Поддерживать monitor и ежедневный fail-closed data-quality audit в beta |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически в production | `/machete/squad`: разделены variant/name и actions; Save стал основным; вторичные actions/settings свёрнуты; одинаковое transfer-warning показывается один раз; suggestions сокращены до top 3; 1024–1279 снова имеет Pool; mobile workspace/global navigation не обрезана; desktop controls геометрически не пересекаются; production workflow green | Нужна проверка на физических устройствах и реальных пользователях |

## UI-cleanup: что именно изменено

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
- Проверенный часовой отчёт после promote: 523 user-traffic запроса, 17 4xx,
  2 5xx, server error rate 0,382%, p50/p75/p95/max
  20,892/63,831/254,644/4 125,378 мс.
- `/_monitor/*` и warning-only data-quality/price health endpoints исключены из
  user-traffic метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Run `29492135499`: critical failures 0, data-quality PASS; issue `#1`
  автоматически закрыт, access audit имеет статус `ok`.
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
