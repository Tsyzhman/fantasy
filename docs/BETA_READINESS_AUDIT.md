# Beta Readiness Audit

Дата проверки: 2026-07-16.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta33 promote:

- image `fantasy-scout-web:beta33-20260716T162012Z`;
- image ID
  `sha256:1632280efe40aac35139e56840fbc5d9be660471303839c0cc1cac63f6deeff4`;
- source commit `c4019cae678638390a0bdc749ab1c5c6f8be7bec`;
- release
  `/var/www/fantasy-scout-releases/20260716T162012Z-beta33-c4019ca-green-main`;
- active container ID
  `43937a69e4348431389473af4daa2600e2232d40e9d0f8d11fa0f5345d75a481`;
- состояние `running|healthy|0`, внешние `/api/health` и
  `/api/health/data-quality` — HTTP 200;
- web и PostgreSQL container logs: `json-file`, `max-size=20m`,
  `max-file=5`;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`,
  тот же image ID
  `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229`
  и тот же volume `fantasy-scout_fantasy-scout-postgres`;
- production DB содержит 8 применённых миграций, 0 failed/rolled-back и
  10 971 строку `matches`; `000008_beta_test_moderated_environment` добавила
  nullable-колонку и DB CHECK для допустимых значений среды;
- проверенный pre-beta32 backup:
  `/var/backups/fantasy-scout/fantasy_scout_pre_beta32_20260716T141021Z.dump`,
  50 259 500 байт, SHA-256
  `38431add328d9e5920dab81d59248a8a7116c2660f540fdcf0e600e85632f4d5`;
- immediate rollback — остановленный bounded-log beta32
  `fantasy-scout-web-beta32-rollback-pre-beta33-20260716T162012Z`, container ID
  `6e25d4c55bf166e23aff2b99c65e4bb63b2b66fa28ca203c8580a27b22343958`;
- исторический beta32 до log-fix сохранён как
  `fantasy-scout-web-beta32-unbounded-log-rollback-20260716T144424Z`, container
  ID `2eb8efb7a82284f68f2701033c542fb9f2b1da5efc18c0141c38835226dcaf7c`;
- beta31 дополнительно сохранён остановленным rollback-контейнером
  `fantasy-scout-web-beta31-rollback-20260716T143434Z` с image ID
  `sha256:61d5c13fb55df2723da311fea40bf5a845e72f79798a7fb7518e10ef1565ed4a`.

Перед promote beta33 проверен отдельно на loopback canary:

- image `fantasy-scout-web:beta33-20260716T162012Z` с тем же точным image ID и
  OCI revision `c4019cae678638390a0bdc749ab1c5c6f8be7bec`;
- ingestion worker и schedulers отключены, upload volume read-only;
- `/api/health` вернул 200, неавторизованный JSON-report — 401, worker chunk
  присутствовал; DB signature до/после осталась `8|0|10971`;
- exact canary container ID
  `c97c8e5bcceae4f3983657b565b6bae04a7bf945c0131d6c1e0fb7b46860abf9`
  удалён до production swap;
- stopped candidate был создан с exact env/network/RW upload volume/port/restart
  policy/healthcheck и bounded logs, затем стал active container; candidate-name
  после promote отсутствует;
- guarded swap восстановил loopback HTTP за 2,242 секунды и сохранил DB signature;
- production Edge acceptance дал valid 15/11/4, бюджет 100/100, save + reload,
  2 463 мс до результата auto-pick, synthetic event duration 128 мс, worker chunk
  HTTP 200, compact table 744 px и document width 1440/1440 и 390/390;
- USER получил 403 на JSON-report, ADMIN — 200 с `private, no-store`, attachment
  и без PII; одноразовые QA user/session/squad/credentials удалены, DB-счётчики
  восстановлены до users 4, sessions 9, squads 2, squad players 30, real runs 0,
  synthetic runs 1;
- production browser workflow `29517734343` дал 5 passed и 2 expected skipped,
  artifact `8383413207`; monitor `29517734277` — 0 critical и 0 warning;
- monitor зафиксировал 227 запросов, 0 ответов 5xx, p75 37,322 мс и p95
  218,53 мс. Это короткое окно, а не закрытый длительный beta error-rate;
- финальная проверка: app log 2 320 байт, 0 critical-pattern строк за 20 минут;
  DB и exact контейнеры второго агента остались без изменений.

## Итог

Полноценная beta пока не доказана. Технический путь от поиска игрока до
сохранения валидного автосостава работает, прогнозное покрытие выше 98%,
пяти-туровый backtest пройден, установленные короткие performance-пороги
выполнены. В beta33 удалены повторные validation checks, player pool стал уже и
ниже, команды отображаются DB-short-name, fixtures — как 3 + `+N`, а auto-pick
вынесен с main thread в Web Worker. Это закрывает текущий технический и
визуальный UI-gate, но не заменяет проверку понятности интерфейса реальными
пользователями.
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
| 1 | Путь от поиска игрока до сохранения оптимизированного состава | Выполнено технически | Production beta33 Edge acceptance и workflow `29517734343` авторизуются, получают реальный forecast pool, запускают Web Worker auto-pick, получают допустимые 15/11/4 и бюджет 100/100, сохраняют вариант, подтверждают server-returned `squadId`/reload и удаляют QA-копию. Ручной QA cleanup вернул DB к исходным счётчикам | Понятность пути для аудитории доказывается критерием 9 |
| 2 | Сборщик не нарушает правила и бюджет | Выполнено для EPL-контура | Сервер заново загружает авторитетный pool и проверяет размер, позиции, схему старта, скамейку, клубный лимит, бюджет, капитана и transfer limit. UI-save принимается только после `Valid squad`; unit-тесты отклоняют недопустимые payload | Отдельная rule-matrix потребуется при добавлении других fantasy-турниров |
| 3 | Прогнозы доступны всем основным игрокам | Выполнено | Production run `cmrndxcnu000010km2tdjbsis`: forecast coverage 745/753 = 98,938%, player coverage 98,938%, match coverage 380/380 = 100%, stat-row coverage 99,967%, общий gate PASS | Продолжать ежедневный fail-closed audit на новых данных |
| 4 | Автоподбор и трансферы работают на реальных данных | Выполнено в согласованном объёме без официальных цен | Игроки, DB short names команд, статистика, матчи и прогнозы берутся из production FotMob-контура. Beta33 Web Worker создал допустимый состав за 2 463 мс; UI показал 6 transfer plans с прогнозным выигрышем, заменами и рисками по реальному pool | Официальные цены явно отложены владельцем продукта; оценочные цены не выдаются за официальные |
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta33 workflow `29517734343` проверил Chromium на 1440×1000, 1024×900 и Pixel 5: 5 passed, 2 expected skipped; artifact `8383413207`. Дополнительный production Edge-сеанс проверил desktop 1440×1000 и mobile viewport 390×844, document width 1440/1440 и 390/390, save/reload и mobile admin report. Исторический WebKit 26.5/iPhone-UA acceptance остаётся валидным только как engine/geometry evidence: `maxTouchPoints=0`, platform `Win32`. Физические счётчики — 0/1 и 0/1 | Нужны реальные прогоны на физических Safari iOS и Chrome Android; понятность пути для аудитории проверяется критерием 9 |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Production beta33 дал 2 463 мс до 15/15 при лимите 5 с и synthetic interaction event 128 мс; worker chunk вернулся 200. Max long task при отрисовке результата был 483 мс и не скрывается. Monitor `29517734277`: 227 запросов, 0 ответов 5xx, p75 37,322 мс, p95 218,53 мс, 0 critical и 0 warning. RUM всё ещё требует LCP минимум от 10 реальных участников, p75 ≤2,5 с | Сейчас реальных RUM-участников 0; synthetic Edge measurement не заменяет фактическую beta-выборку |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 263/263 unit/integration, lint, typecheck, production build; CI `29514918014` на commit `c4019ca` green. Browser run `29517734343` green; beta33 container: `running` / `healthy` / `0 restarts`, bounded 5×20 MiB, 0 critical-pattern log lines за 20 минут. Monitor `29517734277` дал 0 critical, 0 warning и 0/227 ответов 5xx | Короткий acceptance без ошибок не доказывает длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и `/admin/beta-test` готовы. Beta33 production проверил USER 403 и ADMIN 200/no-store/attachment/no PII для JSON-report; UI честно показывает FAIL, participants 0/10, real RUM 0/10 и physical 0/1 + 0/1. Synthetic evidence исключается из human/RUM gates | Сейчас 0 доказанных реальных участников; нужны ≥10, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5, physical iOS ≥1 и Android ≥1 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; public aggregate работает. Beta33 app и PostgreSQL logs ограничены 5×20 MiB; app log 2 320 байт и 0 critical-pattern строк за 20 минут. DB — 8 applied, 0 failed, 10 971 matches; data-quality PASS. Monitor `29517734277` green: 0 critical, 0 warning, 227 запросов, 0 ответов 5xx, p75/p95 37,322/218,53 мс | Поддерживать monitor и ежедневный fail-closed data-quality audit в beta; короткое окно не считать длительным error-rate |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически и визуально | Beta31 убрала повторные hero/breadcrumbs/intro и mobile-таблицу. Beta33 убрала второй слой position/starter/bench checks, оставила один summary и GK/DEF/MID/FWD в составе, сократила desktop table до 744 px с rows 45 px, использует DB short names и 3 fixtures + `+N`. Workflow `29517734343` и ручные 1440/390 screenshots подтвердили geometry и отсутствие page overflow | Субъективную понятность и оценку ≥4/5 всё ещё должны подтвердить реальные участники в критерии 9 |

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
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live beta33 app и PostgreSQL containers используют `json-file` 5×20 MiB.
  PostgreSQL сохранил тот же image/env/network/volume; подтверждены 8 миграций,
  0 failed и 10 971 строка `matches`. Финальный app log — 2 320 байт,
  critical-pattern строк за 20 минут — 0.
- Финальный проверенный отчёт monitor `29517734277`: 227 user-traffic запросов,
  0 ответов 5xx, p75 37,322 мс, p95 218,53 мс. Это короткое acceptance-окно,
  не доказательство длительного beta error-rate.
- `/_monitor/*` и warning-only data-quality/price health endpoints исключены из
  user-traffic метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Финальный run `29517734277`: critical failures 0, warnings 0,
  data-quality PASS,
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
