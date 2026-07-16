# Beta Readiness Audit

Дата проверки: 2026-07-16.

Источник требований: `C:/Users/Nik/Downloads/SMART план.md` и его Definition of
Done. По просьбе владельца продукта готовность официальных fantasy-цен временно
исключена из текущего объёма: цены не подменяются и продолжают явно обозначаться
как оценочные. Это исключение не превращает отсутствующие официальные цены в
выполненный факт.

Текущий production после beta32 promote:

- image `fantasy-scout-web:beta32-20260716T141021Z`;
- image ID
  `sha256:bc3560ea302dabc5b28e3acf48062f08f30749a0052a6e4f5a013351f538f75c`;
- source commit `5be7247ba08d70c342915d884e0ee2ed4eacdb68`;
- release
  `/var/www/fantasy-scout-releases/20260716T141021Z-beta32-5be7247-green-main`;
- active container ID
  `6e25d4c55bf166e23aff2b99c65e4bb63b2b66fa28ca203c8580a27b22343958`;
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
- первый beta32 container унаследовал пустой Docker `LogConfig.Config`; это
  обнаружено после promote и исправлено контролируемым пересозданием того же
  образа с явными `max-size=20m`, `max-file=5`;
- предыдущий beta32 сохранён остановленным immediate rollback-контейнером
  `fantasy-scout-web-beta32-unbounded-log-rollback-20260716T144424Z`, container
  ID `2eb8efb7a82284f68f2701033c542fb9f2b1da5efc18c0141c38835226dcaf7c`;
- beta31 дополнительно сохранён остановленным rollback-контейнером
  `fantasy-scout-web-beta31-rollback-20260716T143434Z` с image ID
  `sha256:61d5c13fb55df2723da311fea40bf5a845e72f79798a7fb7518e10ef1565ed4a`.

Перед promote beta32 проверен отдельно на loopback canary:

- image `fantasy-scout-web:beta32-20260716T141021Z` с тем же точным image ID;
- ingestion worker и schedulers отключены, upload volume read-only;
- защищённый `/admin/beta-test` проверен Playwright CLI на desktop и 390 px:
  horizontal overflow 0, console errors/warnings 0, environment-select обязателен
  и содержит только `DESKTOP_BROWSER`, `IOS_SAFARI_PHYSICAL`,
  `ANDROID_CHROME_PHYSICAL`, `OTHER_MOBILE`;
- одноразовые QA-user/run/session и credentials удалены; production вернулся к
  0 real, 0 valid real и 0 pending real runs;
- production browser workflow `29507456004` дал 5 passed и 2 expected skipped,
  artifact `8379167025`; финальный monitor после log-fix `29508147332` —
  0 critical и 0 warning;
- monitor при этом честно зафиксировал 252 запроса, 1 ответ 5xx (0,397%),
  p75 81,056 мс и p95 706,259 мс; это ниже alert-порогов, но не равно нулю 5xx;
- первый beta32 swap восстановил loopback HTTP за 2,351 секунды, финальный
  log-fix swap — за 1,909 секунды; после acceptance exact canary удалён,
  остановленные beta32 и beta31 rollback сохранены.

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
| 5 | Полноценная работа на компьютере и телефоне | Частично | Beta32 workflow `29507456004` проверил Chromium на 1440×1000, 1024×900 и Pixel 5: 5 passed, 2 expected skipped; evidence в artifact `8379167025`. Playwright CLI отдельно проверил новый moderator UI на desktop и 390 px: overflow 0, console errors/warnings 0. Структурированная фиксация physical Safari iOS/Chrome Android теперь обязательна, защищена allowlist и DB CHECK, но фактические счётчики остаются 0/1 и 0/1 | Нужны реальные прогоны на физических Safari iOS и Chrome Android; понятность пути для аудитории проверяется критерием 9 |
| 6 | Выполнены показатели скорости | Частично только из-за real-user sample | Исторические production замеры проходят SMART-пороги: squad SSR p75 480 мс, client summary p75 552 мс, автоподбор 2,903 с, transfer suggestions p75 581 мс. Финальный monitor `29508147332`: 252 запроса, 1 ответ 5xx (0,397%), p75 81,056 мс, p95 706,259 мс, 0 critical и 0 warning. Beta32 собирает opt-in RUM и требует LCP минимум от 10 реальных участников, p75 ≤2,5 с; pending/invalid/failed прогоны нельзя исключить модерацией | Сейчас реальных RUM-участников 0; нужна фактическая beta-выборка |
| 7 | Отсутствуют критические ошибки | Частично | Локальный gate: 263/263 unit/integration, lint, typecheck, production build. Main CI `29505104261` полностью green; beta32 browser run `29507456004` green; финальный beta32 container healthy, 0 рестартов, app/PostgreSQL logs ограничены 5×20 MiB. Monitor `29508147332` дал 0 critical и 0 warning, но за окно был 1 ответ 5xx из 252 — факт не скрывается | Короткий acceptance и единичный 5xx не доказывают длительную beta без critical/blocker |
| 8 | Завершено историческое тестирование модели | Выполнено | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; пяти-туровый RMSE улучшен для GK/DEF/MID/FWD на 16,569/10,759/13,403/11,116% | Одноматчевый горизонт отдельно не достиг 10%; вывод относится к пяти-туровому планированию |
| 9 | Не менее 80% тестовых пользователей проходят сценарий без помощи | Не выполнено | `/beta-test`, consent, bounded telemetry и защищённый `/admin/beta-test` готовы; synthetic evidence исключается из human/RUM gates, RUM использует все реальные прогоны. Beta32 требует структурированный moderator environment, отклоняет несовпадение physical-device/desktop viewport и не открывает gate без physical iOS и Android primary runs | Сейчас 0 доказанных реальных участников; нужны ≥10, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5, physical iOS ≥1 и Android ≥1 |
| 10 | Мониторинг, логи и контроль обновления данных | Выполнено технически | Caddy JSON log ротируется; systemd audit каждые 15 минут; warning-health исключены из user error-rate; public aggregate работает. Унаследованный пустой app log config обнаружен и устранён: финальные app и PostgreSQL logs явно ограничены 5×20 MiB. Реальный refresh `1` дал 380/380 fetched, 0 failed; audit `cmrndxcnu000010km2tdjbsis` дал latency 100% и PASS; оба health endpoint возвращают 200. Финальный monitor `29508147332` green: 0 critical, 0 warning, fresh data-quality PASS; access audit 252 запроса, 1 ответ 5xx (0,397%), p75/p95 81,056/706,259 мс | Поддерживать monitor и ежедневный fail-closed data-quality audit в beta |
| 11 | Чистый UI без наложений, обрезанной навигации и лишнего повторяющегося шума | Выполнено технически и визуально | В beta31 убраны дублирующий Machete hero, breadcrumbs и большая intro-card; tools свёрнуты, метрики собраны в strip, workbench поднят выше transfer tips, mobile-таблица заменена карточками. Пустой состав больше не назван valid, Save отключён до допустимых 15/11/4, а активная `Squad` целиком видна на 360 px. Финальный beta32 production workflow `29507456004` снова дал 5 passed/2 skipped; screenshots сохранены в artifact `8379167025` | Субъективную понятность и оценку ≥4/5 всё ещё должны подтвердить реальные участники в критерии 9 |

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

## Мониторинг и логи

- Caddy `v2.11.3` пишет `/var/log/caddy/fantasy-access.log` от `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days.
- `fantasy-access-audit.timer` active+enabled, период 15 минут.
- Live app и PostgreSQL containers используют `json-file` 5×20 MiB. Первый
  beta32 candidate ошибочно унаследовал пустой app log config; проверка после
  promote это обнаружила, после чего тот же image пересоздан с явными limits.
  PostgreSQL сохранил тот же image/env/network/volume; подтверждены 8 миграций,
  0 failed и 10 971 строка `matches`.
- Финальный проверенный отчёт: 252 user-traffic запроса, 1 ответ 5xx (0,397%),
  p75 81,056 мс, p95 706,259 мс. Это ниже warning-порога, но не равно 0 5xx.
- `/_monitor/*` и warning-only data-quality/price health endpoints исключены из
  user-traffic метрики; report не содержит URL, IP, cookies, headers или user
  identifiers.
- Workflow `Production Monitor` проверяет liveness/login как critical и
  data-quality/access audit как warning; состояние синхронизируется с одним
  GitHub Issue без обновления на каждом одинаковом прогоне.
- Финальный run `29508147332`: critical failures 0, warnings 0,
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
