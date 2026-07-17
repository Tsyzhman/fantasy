# Beta Readiness Audit

Дата проверки: 2026-07-17.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta38 promote:

- image `fantasy-scout-web:beta38-20260717T093041Z`;
- image ID
  `sha256:d0dbfd93e1055d7502cce16718698831595fd1340873398218fb3a22fb0eefc7`;
- source commit `cfc1bc9d70e3d44b627cc3cffffe278de70e11c7`;
- release
  `/var/www/fantasy-scout-releases/20260717T093041Z-beta38-cfc1bc9-green-main`;
- active container ID
  `815ae6085d78e7b4887b4c012a27f21bc57de31a8e639541b0e4fcfacd5064c8`;
- состояние `running|healthy|0`, port `127.0.0.1:3000`, network
  `fantasy-scout_default`, upload volume RW, restart policy `unless-stopped`,
  logs `json-file` / `max-size=20m` / `max-file=5`;
- symlink `/var/www/fantasy-scout-current` атомарно указывает на beta38 release;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  остался `running|healthy|0`; production DB содержит 8 применённых миграций,
  0 failed/rolled-back и 10 972 строки `matches`;
- после production browser smoke: users 4, saved squads 2, squad players 30,
  synthetic runs 1, real runs 0, reviewed real runs 0, observations 20; временный
  `E2E optimized …` состав удалён;
- immediate rollback — exact beta36 container
  `fantasy-scout-web-beta36-rollback-pre-beta38-20260717T093041Z`, container ID
  `16398e4b3103a2408b67414ced74e2df28d2ce72bb3f64d2b375afc5b90c6f94`,
  state `exited`, restart count 0;
- более старый exact beta33 rollback сохранён отдельно в state `created`:
  `fantasy-scout-web-beta33-rollback-pre-beta36-20260717T070721Z`, container ID
  `c2cea7a73bcc53df5e352cce6c9baee4bc51b02f21f7c65d5c804083851b21dd`;
- exact beta2 containers второго агента остались `running` с 0 restarts и не
  изменялись этим rollout.

## Beta38 release acceptance

- clean archive SHA-256
  `adcdfedda301307200e10cc00e08abc4884e3dfd46c0e38510cea2e10363dd52`;
- loopback canary использовал exact beta38 image/revision, port
  `127.0.0.1:3418`, 1 CPU / 1 GiB / 256 PID и отключённые ingestion/schedulers;
  canary ID `6863525f00aefe9db76224564b3c2953747501d9bcf2f00da57bd8b55c4a3997`
  после acceptance и exact QA cleanup удалён, port 3418 освобождён;
- touch-эмуляция Edge проверила 390×844 и 844×390 с `pointer:coarse`: mobile
  cards видимы, desktop table скрыта, page overflow 0, 140 player actions имеют
  минимум 44×44 px. Единая кнопка `Actions` открывает bottom sheet с focus trap,
  Escape, возвратом focus, scroll lock и safe-area; console errors — 0. Это не
  physical Safari iOS/Chrome Android evidence;
- pending real-user run теперь не может пройти human gate без moderator review;
- кандидат перед swap совпал с active по env и нормализованному полному
  `HostConfig`; runtime fingerprint SHA-256
  `d6ea93f3f0f9336b236e6f00cc55be51655934a688a7473863a85aed5476baf4`;
- первая попытка beta38 swap временно остановила production: generic
  `docker inspect` при свободном container name разрешил одноимённый image и
  защитный rollback отказался принимать его за container. Exact beta36 был
  восстановлен вручную; длительность этого перерыва не была инструментирована.
  Все container lookups заменены на `docker container inspect`, повторный аудит
  не нашёл P0–P2;
- успешный guarded swap восстановил HTTP за 1,835 с. Exact digest 13 критических
  таблиц до/после совпал; это не утверждение о побитовом равенстве всей DB.
  App/PostgreSQL/Caddy critical logs — 0, Caddy 5xx во время swap — 0;
- CI `29570144902` на `cfc1bc9` green. Production browser workflow
  `29573697960` дал 5 passed и 2 expected skipped; artifact `8404162521`.
  После него active остался `running|healthy|0`, а окно от старта beta38 содержит
  206 Caddy requests, 0×5xx и 0 critical app/PostgreSQL/Caddy lines;
- Production Monitor `29573699815` green только по critical availability:
  `criticalFailures=0`, но `warnings=1`, `alertRequired=true`. Access snapshot
  содержит 14 eligible requests и две `500 POST /` в 10:13 UTC, до старта
  beta38 в 10:29 UTC, поэтому status — `insufficient_data`. Предупреждение не
  скрывается и длительный real-user error-rate gate остаётся открытым.

## Историческая beta36 acceptance

Перед promote beta36 образ был проверен отдельно на loopback canary:

- clean archive SHA-256
  `1661d4096e0749a71835309029b6187cd60d30caac1a8bff0a209ac0cb5900df`;
- canary использовал тот же exact image/revision, port `127.0.0.1:3416`,
  read-only upload volume и отключённые ingestion/schedulers;
- `/api/health` вернул 200, неавторизованный JSON-report — 401, runtime содержал
  optimizer worker, `pagehide` и `pageshow`; critical log lines — 0;
- Edge прошёл путь `Mbeumo` → planner → blank → auto-pick 15/15 → valid squad →
  применение реальной transfer-рекомендации → save → server `squadId` → reload →
  restore. Все 8 milestone записаны в правильном порядке, LCP `/machete/players`
  присутствует, `JOURNEY_ABORTED` и client errors отсутствуют; серверное время до
  `SQUAD_RESTORED` — 39 375 мс, локальная сессия очищена за 83 с;
- exact cleanup удалил 1 QA user, 2 synthetic runs, 40 observations и 2 QA squads;
  DB signature до/после осталась `8|0|10972`, canary ID
  `101881b3e44abf0dc3d5d521a43e9afe2cc3f1a57b00613fdfa80b1288040d69`
  удалён, port 3416 освобождён;
- stopped candidate получил exact env/network/RW upload volume/port/restart
  policy/healthcheck/log config; guarded swap восстановил HTTP за 2,153 секунды
  и сохранил beta33 как immediate rollback;
- локально прошли 274/274 теста, lint, typecheck и production build; CI
  `29561609805` на commit `c0d969b` green;
- post-rotation workflow `29566426370` дал 5 passed и 2 expected skipped,
  artifact `8401309300`. Внутри report ZIP есть только
  desktop/tablet/mobile проекты, нет
  `auth.setup`, password selector, QA env или auth-state. Старый небезопасный
  artifact удалён, пароль Production Beta QA ротирован;
- stale rendered compose-config с mode 0664 содержал текущие production DB/cron
  credentials. Exact-файл удалён, DB password, `DATABASE_URL` и `CRON_SECRET`
  ротированы; старые active/rollback containers с прежними значениями удалены.
  Новый active сохранил тот же exact beta36 image/revision, HTTP восстановлен за
  6,742 с, `.env` остался 0600;
- monitor `29566962197` green: 0 critical, 0 warnings. Его свежий access
  snapshot исключил 399 tagged synthetic-запросов, включил 234 eligible
  запроса, 0×5xx, p75/p95 22,767/50,482 мс и окно 51,834 минуты. Исторический
  первый snapshot `insufficient_data` не скрывается, а новое короткое окно всё
  ещё не заменяет длительное real-user evidence.

## Итог

Полноценная beta пока не доказана. Beta38 подтверждает технический путь от поиска
игрока до сохранения валидного автосостава в production; исторический beta36
canary дополнительно подтвердил применение реальной transfer-рекомендации и
reload/restore. Прогнозное покрытие выше 98%, пяти-туровый backtest пройден,
установленные короткие performance-пороги выполнены. Beta38 убрала мелкие touch-
цели и разрозненные действия игрока: на coarse pointer остаются mobile cards и
одна кнопка `Actions` с доступным bottom sheet. Это закрывает технический и
визуальный UI-gate, но не заменяет проверку понятности интерфейса реальными
пользователями или физическими телефонами.
На сервере включены ротация Caddy access log, 15-минутный агрегированный аудит
5xx/latency, публичный обезличенный health snapshot и безопасные GET retry Caddy
для кратких upstream EOF. Synthetic monitor/browser трафик теперь имеет явный
User-Agent и исключается из real-user error-rate.
После реального последовательного refresh 380 матчей production data-quality
gate проходит, включая 100% raw→normalized latency coverage.

Оставшиеся блокеры:

1. нет минимум 10 реальных участников и доказанного completion rate ≥80%;
2. нет проверки на физических Safari iOS и Chrome Android;
3. нет длительного RUM/Web Vitals и server error rate за период реальной beta.

## Сводка по Definition of Done

| # | Критерий | Статус | Проверенное доказательство | Что ещё требуется |
|---|---|---|---|---|
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Production beta38 workflow `29573697960` прошёл auth, реальный pool/search, auto-pick валидного 15/15, save и exact QA-delete. Исторический beta36 canary дополнительно применил реальную transfer-рекомендацию, подтвердил server `squadId`, reload и `SQUAD_RESTORED`; client errors 0 | Понятность пути для аудитории доказывается критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для EPL-контура | Сервер заново загружает авторитетный pool и проверяет размер, позиции, схему старта, скамейку, клубный лимит, бюджет, капитана и transfer limit. UI-save принимается только после `Valid squad`; unit-тесты отклоняют недопустимые payload | Отдельная rule-matrix потребуется при добавлении других fantasy-турниров |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production run `cmrndxcnu000010km2tdjbsis`: forecast coverage 745/753 = 98,938%, player coverage 98,938%, match coverage 380/380 = 100%, stat-row coverage 99,967%, общий gate PASS | Продолжать ежедневный fail-closed audit на новых данных |
| 4 | Автоподбор и трансферы работают на реальных данных | Выполнено в согласованном объёме без официальных цен | Игроки, DB short names команд, статистика, матчи и прогнозы берутся из production FotMob-контура. Beta38 production smoke снова построил допустимый 15/15; исторический beta36 canary применил доступную в UI реальную transfer-рекомендацию до save/reload | Официальные цены явно отложены владельцем продукта; оценочные цены не выдаются за официальные |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta38 workflow `29573697960`: desktop/tablet/mobile 5 passed, 2 expected skipped, artifact `8404162521`. Touch-эмуляция 390×844 и 844×390 подтвердила coarse-pointer cards, 44 px actions, accessible bottom sheet и 0 overflow. Это всё ещё эмуляция; физические счётчики — 0/1 и 0/1 | Нужны реальные прогоны на физических Safari iOS и Chrome Android; понятность пути для аудитории проверяется критерием 9 |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Unit performance gates для 640-player auto-pick <5 с и 500-player transfer plans <10 с проходят. Исторический beta36 journey занял 83 с, до `SQUAD_RESTORED` — 39,375 с. Beta38 HTTP восстановлен за 1,835 с; после старта 206 Caddy requests, 0×5xx. RUM требует LCP минимум от 10 реальных участников, p75 ≤2,5 с | Сейчас реальных RUM-участников 0; production workflow и HTTP requests не доказывают людей и не заменяют фактическую beta-выборку |
| 7 | Отсутствуют критические ошибки | Частично | CI `29570144902` на `cfc1bc9` green; production browser `29573697960` green; beta38 `running|healthy|0`, 0 app/PostgreSQL/Caddy critical и 0×5xx в окне от старта. Первая попытка swap временно остановила production из-за namespace ambiguity в deploy guard; beta36 был восстановлен, typed fix прошёл повторный аудит | Короткий acceptance без ошибок не доказывает длительную beta без critical/blocker; deploy-инцидент не скрывается |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и `/admin/beta-test` готовы. Production DB: users 4, synthetic runs 1, real runs 0, reviewed real runs 0. Synthetic evidence исключается из human/RUM gates | Нужны ≥10 реальных участников, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5, physical iOS ≥1 и Android ≥1 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; public aggregate работает; app/PostgreSQL logs ограничены 5×20 MiB. Browser/monitor UA исключаются из real-user метрики. DB — 8 applied, 0 failed, 10 972 matches; data-quality PASS. Run `29573699815`: critical 0, warning 1; access audit честно `insufficient_data` (14 eligible, 2×5xx до beta38). От старта beta38: 206 requests, 0×5xx | Поддерживать monitor и ежедневный fail-closed data-quality audit; накопить длительное реальное окно и закрыть warning реальными данными, не synthetic-трафиком |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически и визуально | Beta31 убрала hero/breadcrumbs/intro и mobile-таблицу; beta33 убрала повторные checks и сократила desktop table. Beta38 для coarse pointer принудительно оставляет cards даже в landscape, заменяет множество мелких row-controls одной 44 px `Actions` и доступным bottom sheet. Workflow `29573697960` и touch-эмуляция подтвердили 0 overflow/console errors | Субъективную понятность и оценку ≥4/5 всё ещё должны подтвердить реальные участники в критерии 9 |

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
- production workflow `29507456004` сохранил 0 document overflow и полный путь
  search → auto-pick → valid → save → cleanup.
- отдельный production HTTPS-сеанс WebKit 26.5 с iPhone 13 UA на 390×664
  подтвердил USER-login, реальный pool/search, Squad/Pool/Tips/Menu, 0 overflow и
  0 console errors/warnings. `maxTouchPoints=0`, поэтому это не physical gate.

Вторая чистка beta33:

- было: одинаковые position/starter/bench ограничения повторялись несколькими
  слоями chips и карточек; таблица была широкой и глубокой, команда занимала
  полное название, а пять fixtures росли вертикально;
- стало: один общий status + единственные GK/DEF/MID/FWD counters внутри состава,
  без повторных `Поле/GK/DEF/MID/FWD` и `Запас/GK/Поле` checks;
- стало: production desktop table 744 px, header 35 px, first row 45 px; DB short
  name `Man United` сохраняет полное `Manchester United` в title, показываются
  три fixture-pills и доступный `+N`;
- было перед beta38: на coarse pointer при landscape ≥768 px снова включалась
  desktop table, а в каждой строке конкурировали несколько мелких действий;
- стало в beta38: coarse pointer всегда получает mobile cards; одна кнопка
  `Actions` высотой 44 px открывает bottom sheet. Все focusable controls имеют
  минимум 44 px, focus зациклен внутри, Escape закрывает sheet и возвращает focus;
- стало: auto-pick работает в Web Worker; 15/15 получены за 2 463 мс,
  synthetic event duration 128 мс. Ручной Edge-сеанс и workflow `29517734343`
  подтвердили 1440/390 geometry; это не заменяет человеческую оценку UI.

## Мониторинг и логи

- Caddy `v2.11.3` пишет `/var/log/caddy/fantasy-access.log` от `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days. Для кратких upstream EOF
  reverse proxy использует безопасное окно повторов GET: `2s` с интервалом
  `100ms`.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live beta38 app и PostgreSQL containers используют `json-file` 5×20 MiB.
  PostgreSQL сохранил тот же exact container/image/env/network/volume;
  подтверждены 8 миграций, 0 failed и 10 972 строки `matches`.
- Первый проверенный access audit после post-deploy smoke исключил 393 tagged
  synthetic-запроса, оставил 2 eligible запроса, 0 ответов 5xx и вернул
  `insufficient_data`. Более поздний фиксированный snapshot run
  `29566962197` исключил 399 tagged synthetic-запросов, включил 234 eligible,
  0×5xx, p75/p95 22,767/50,482 мс и окно 51,834 минуты. Ни один из этих коротких
  снимков не доказывает длительный beta error-rate или реальных участников.
- `/_monitor/*`, warning-only data-quality/price health endpoints, dedicated
  monitor User-Agent и `fantasy-production-browser-smoke/*` исключены из
  real-user метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Проверенный post-rotation run `29566962197`: critical failures 0, warnings 0,
  data-quality PASS, access audit `ok`.
- Текущий beta38 run `29573699815`: critical failures 0, warning 1,
  `alertRequired=true`. Snapshot `insufficient_data`: 14 eligible requests и
  2×5xx (`POST /`) в 10:13 UTC, до старта beta38. Отдельное окно от старта
  beta38 содержит 206 requests, 0×5xx и 0 critical app/PostgreSQL/Caddy lines,
  но synthetic browser smoke не считается real-user evidence.
- Официальные цены намеренно не входят в monitor до появления источника.

## Оставшиеся обязательные beta-gates

1. Провести протокол минимум на 10 реальных пользователях и выполнить все UX
   пороги SMART-плана.
2. Собрать длительный RUM/Web Vitals и server error rate <1% на реальной группе.
3. Проверить физические Safari iOS и Chrome Android.

Операционно monitor продолжает наблюдать 5xx/latency; текущий warning нельзя
закрывать искусственным трафиком. После появления официальных цен price gate
нужно вернуть в обязательный объём, но сейчас он исключён владельцем продукта.
