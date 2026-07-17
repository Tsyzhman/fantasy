# Beta Readiness Audit

Дата проверки: 2026-07-17.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta36 promote:

- image `fantasy-scout-web:beta36-20260717T070721Z`;
- image ID
  `sha256:6590f96619d8b85ac9215d5a32a8e0b0e4046dea126f670dac108d7fed5141ca`;
- source commit `c0d969bec6f558de61f2dbdd277528dc53a8d7e1`;
- release
  `/var/www/fantasy-scout-releases/20260717T070721Z-beta36-c0d969b-green-main`;
- active container ID
  `16398e4b3103a2408b67414ced74e2df28d2ce72bb3f64d2b375afc5b90c6f94`;
- состояние `running|healthy|0`, port `127.0.0.1:3000`, network
  `fantasy-scout_default`, upload volume RW, restart policy `unless-stopped`,
  logs `json-file` / `max-size=20m` / `max-file=5`;
- symlink `/var/www/fantasy-scout-current` атомарно исправлен с устаревшего beta26
  на beta36 release;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  остался `running|healthy|0`; production DB содержит 8 применённых миграций,
  0 failed/rolled-back и 10 972 строки `matches`;
- после exact canary QA cleanup и production browser smoke: users 4,
  synthetic runs 1, real runs 0, reviewed real runs 0, saved squads 2;
- immediate rollback — новый stopped/created container на exact beta33 image
  `fantasy-scout-web-beta33-rollback-pre-beta36-20260717T070721Z`, container ID
  `c2cea7a73bcc53df5e352cce6c9baee4bc51b02f21f7c65d5c804083851b21dd`;
- exact beta2 containers второго агента остались `running` с 0 restarts и не
  изменялись этим rollout.

Перед promote beta36 проверен отдельно на loopback canary:

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

Полноценная beta пока не доказана. Beta36 подтверждает технический путь от поиска
игрока до применения transfer-рекомендации и сохранения/восстановления валидного
автосостава; прогнозное покрытие выше 98%, пяти-туровый backtest пройден,
установленные короткие performance-пороги выполнены. Clean-UI изменения beta33
остались в beta36 и повторно прошли desktop/tablet/mobile smoke и визуальный Edge
acceptance. Это закрывает технический и визуальный UI-gate, но не заменяет
проверку понятности интерфейса реальными пользователями.
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
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Beta36 canary Edge acceptance нашёл `Mbeumo`, открыл planner, сделал blank → Web Worker auto-pick 15/15 → valid, применил реальную transfer-рекомендацию, сохранил вариант, подтвердил server `squadId`, reload и `SQUAD_RESTORED`. Все 8 milestone в порядке, LCP есть, client errors 0; exact QA cleanup вернул DB к исходному состоянию | Понятность пути для аудитории доказывается критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для EPL-контура | Сервер заново загружает авторитетный pool и проверяет размер, позиции, схему старта, скамейку, клубный лимит, бюджет, капитана и transfer limit. UI-save принимается только после `Valid squad`; unit-тесты отклоняют недопустимые payload | Отдельная rule-matrix потребуется при добавлении других fantasy-турниров |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production run `cmrndxcnu000010km2tdjbsis`: forecast coverage 745/753 = 98,938%, player coverage 98,938%, match coverage 380/380 = 100%, stat-row coverage 99,967%, общий gate PASS | Продолжать ежедневный fail-closed audit на новых данных |
| 4 | Автоподбор и трансферы работают на реальных данных | Выполнено в согласованном объёме без официальных цен | Игроки, DB short names команд, статистика, матчи и прогнозы берутся из production FotMob-контура. Beta36 canary создал допустимый 15/15 и применил не фиктивную, а доступную в UI transfer-рекомендацию до save/reload | Официальные цены явно отложены владельцем продукта; оценочные цены не выдаются за официальные |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Post-rotation workflow `29566426370` проверил Chromium desktop/tablet/mobile: 5 passed, 2 expected skipped; artifact `8401309300`. Edge canary проверил реальный путь save/reload. Исторический WebKit/iPhone-UA acceptance остаётся только engine/geometry evidence: `maxTouchPoints=0`, platform `Win32`. Физические счётчики — 0/1 и 0/1 | Нужны реальные прогоны на физических Safari iOS и Chrome Android; понятность пути для аудитории проверяется критерием 9 |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Unit performance gates для 640-player auto-pick <5 с и 500-player transfer plans <10 с проходят. Beta36 canary завершил весь сценарий за 83 с, до `SQUAD_RESTORED` на сервере — 39,375 с. Post-rotation access snapshot: 234 eligible requests, 0×5xx, p75/p95 22,767/50,482 мс, окно 51,834 минуты. RUM требует LCP минимум от 10 реальных участников, p75 ≤2,5 с | Сейчас реальных RUM-участников 0; eligible HTTP requests не доказывают людей, synthetic/canary measurement не заменяет фактическую beta-выборку |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 274/274 tests, lint, typecheck, production build; CI `29561609805` на `c0d969b` green. Post-rotation browser `29566426370` green; beta36 `running|healthy|0`, bounded 5×20 MiB, client errors 0 и critical log lines 0. Monitor `29566962197`: 0 critical, 0 warnings, 0×5xx | Короткий acceptance без ошибок не доказывает длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и `/admin/beta-test` готовы. Production DB: users 4, synthetic runs 1, real runs 0, reviewed real runs 0. Synthetic evidence исключается из human/RUM gates | Нужны ≥10 реальных участников, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5, physical iOS ≥1 и Android ≥1 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; public aggregate работает; app/PostgreSQL logs ограничены 5×20 MiB. Browser/monitor UA исключаются из real-user метрики. Caddy делает краткие GET retry (`2s/100ms`). DB — 8 applied, 0 failed, 10 972 matches; data-quality PASS. Monitor `29566962197` green, 0 critical/0 warnings; fresh snapshot: 399 synthetic excluded, 234 eligible, 0×5xx, окно 51,834 минуты | Поддерживать monitor и ежедневный fail-closed data-quality audit; накопить длительное реальное окно, не считать короткий/synthetic acceptance real-user evidence |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически и визуально | Beta31 убрала повторные hero/breadcrumbs/intro и mobile-таблицу. Beta33 убрала второй слой position/starter/bench checks, оставила один summary и GK/DEF/MID/FWD, сократила desktop table, использует DB short names и 3 fixtures + `+N`. Post-rotation beta36 workflow `29566426370` и screenshots повторно подтвердили compact layout без console errors | Субъективную понятность и оценку ≥4/5 всё ещё должны подтвердить реальные участники в критерии 9 |

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
- стало: auto-pick работает в Web Worker; 15/15 получены за 2 463 мс,
  synthetic event duration 128 мс. Ручной Edge-сеанс и workflow `29517734343`
  подтвердили 1440/390 geometry; это не заменяет человеческую оценку UI.

## Мониторинг и логи

- Caddy `v2.11.3` пишет `/var/log/caddy/fantasy-access.log` от `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days. Для кратких upstream EOF
  reverse proxy использует безопасное окно повторов GET: `2s` с интервалом
  `100ms`.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live beta36 app и PostgreSQL containers используют `json-file` 5×20 MiB.
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
- Официальные цены намеренно не входят в monitor до появления источника.

## Обязательные следующие действия

1. Провести протокол минимум на 10 реальных пользователях и выполнить все UX
   пороги SMART-плана.
2. Собрать длительный RUM/Web Vitals и server error rate <1% на реальной группе.
3. Проверить физические Safari iOS и Chrome Android.
4. Наблюдать за повторением шести одновременных synthetic-run upstream EOF.
   GET retry уже включён, но длительный error-rate gate нельзя закрывать по
   одному короткому acceptance-окну.
5. После появления официальных цен вернуть price gate в обязательный объём; до
   этого не выдавать оценочные цены за официальные.
