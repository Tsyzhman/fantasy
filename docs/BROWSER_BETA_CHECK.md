# Browser Beta Check

Дата проверки: 2026-07-17.

## Beta36 production acceptance 2026-07-17

Production работает на образе
`fantasy-scout-web:beta36-20260717T070721Z`, image ID
`sha256:6590f96619d8b85ac9215d5a32a8e0b0e4046dea126f670dac108d7fed5141ca`,
source commit `c0d969bec6f558de61f2dbdd277528dc53a8d7e1`. Активный container ID —
`16398e4b3103a2408b67414ced74e2df28d2ce72bb3f64d2b375afc5b90c6f94`;
состояние `running|healthy|0`.

Post-rotation GitHub Actions Playwright workflow `29566426370` прошёл: 1 auth
setup и 4 browser-проверки passed, 2 проверки expected skipped. Artifact
`8401309300` содержит только 6 desktop/tablet/mobile screenshots, report index
и 3 report images: нет
`auth.setup`, password selector, QA env или auth-state. Пароль отдельного
Production Beta QA пользователя после удаления старого небезопасного artifact
ротирован.

Перед promote тот же exact image/revision прошёл отдельный Edge canary на
`127.0.0.1:3416`: поиск `Mbeumo` → planner → blank → Web Worker auto-pick
15/15 → valid squad → применение реальной transfer-рекомендации → save → server
`squadId` → reload → restore. Все 8 milestone записаны в правильном порядке,
LCP `/machete/players` присутствует, `JOURNEY_ABORTED` и client errors
отсутствуют. Серверное время до `SQUAD_RESTORED` — 39 375 мс, полный локальный
сеанс — 83 с. Exact cleanup удалил QA user, 2 synthetic runs, 40 observations и
2 QA squads; canary удалён, port 3416 освобождён.

Caddy исключает dedicated browser-smoke User-Agent из real-user error-rate.
Monitor `29566962197` после credential rotation дал 0 critical/0 warnings;
свежий snapshot исключил 399 tagged synthetic-запросов, включил 234
eligible, 0×5xx, p75/p95 22,767/50,482 мс и окно 51,834 минуты. Это release
evidence, а не доказательство RUM реальных пользователей или длительного окна.

Перед этой повторной проверкой удалён stale world-readable rendered
compose-config и ротированы production DB password, `DATABASE_URL` и
`CRON_SECRET`. Старые web/rollback containers с прежними значениями удалены;
новый active остался на том же exact beta36 image/revision, public health —
HTTP 200.

## Текущий итог

Технический основной сценарий работает в production: beta36 повторно
подтвердила поиск реального игрока с прогнозом, переход в планировщик, загрузку
пула, допустимый auto-pick 15/15, реальную transfer-рекомендацию,
save/reload/restore и отсутствие browser client errors. Desktop, tablet и mobile
проекты прошли smoke; clean-UI beta33 остаётся в runtime.

Это не означает готовность полноценной beta: длительный beta error rate и RUM
не собраны, физические iOS/Android не проверены, тест минимум на 10 реальных
пользователях не проведён. Официальные цены Sports.ru временно исключены из
объёма владельцем продукта и не подменяются оценочными.

## Историческая browser-проверка beta33

Историческая browser-проверка выполнена GitHub Actions Playwright Test workflow
`29517734343` против production `https://fantasy.tsyzhman.ru` на образе
`fantasy-scout-web:beta33-20260716T162012Z` с image ID
`sha256:1632280efe40aac35139e56840fbc5d9be660471303839c0cc1cac63f6deeff4`
и source commit `c4019cae678638390a0bdc749ab1c5c6f8be7bec`.

Workflow дал 5 passed, 2 expected skipped за 54,8 секунды тестов и 1 минуту
54 секунды целиком. Evidence загружен в artifact
`production-browser-smoke-29517734343` (`8383413207`, SHA-256 архива
`1fe999d83c8d65b4a200c4c56398f99137a9836529ae8b71b02db30bf1dbd824`). Использован
отдельный production QA-пользователь; пароль хранится только в GitHub Secrets.
Write-сценарий создаёт уникальный `E2E optimized …` вариант, проверяет
server-returned `squadId` и удаляет QA-копию; рабочие пользовательские данные не
меняются.

Этот smoke подтверждает работоспособность сценария и отсутствие измеримого
viewport overflow. Дополнительный production HTTPS-сеанс в Edge проверил
1440×1000 и 390×844, сохранение и reload, отдельный Web Worker, доступы к
JSON-отчёту и визуальную плотность beta33. Одноразовые QA user/session/squad и
credentials удалены; исходные DB-счётчики восстановлены. Понятность для
аудитории это не доказывает — она остаётся частью теста на 10 реальных
пользователях.

Дополнительно выполнен одноразовый acceptance на публичном production HTTPS в
Playwright CLI `0.1.17`, browser engine WebKit `26.5`, с iPhone 13 UA и viewport
390×664 при DPR 3. Обычный пользователь авторизовался, открыл `/machete/squad`,
загрузил реальный player pool, нашёл Bryan Mbeumo, переключил Squad/Pool/Tips и
открыл global Menu. В принятом HTTPS-сеансе console errors/warnings — 0, все
наблюдавшиеся API/RSC-запросы — 200, login POST — 303, root/body scroll width —
390 px. Инструмент сообщил `maxTouchPoints=0`, поэтому это проверка WebKit и
мобильной геометрии, а не полноценная touch-эмуляция и не физический Safari iOS.

## Исторический итог beta33

Технический основной сценарий работает в production: поиск игрока возвращает
реального игрока и прогноз, переход в планировщик доступен, полный пул
догружается, допустимый состав 15/11/4 укладывается в бюджет 100/100,
сохраняется и восстанавливается после reload, а трансферные рекомендации
работают. Автоподбор вынесен в отдельный Web Worker; production selection занял
2,463 секунды, synthetic interaction event — 128 мс. Desktop и мобильный
viewport не расширяют документ по горизонтали. Защищённый JSON-отчёт возвращает
403 обычному USER и 200 ADMIN с `private, no-store`, attachment и без PII.

Это не означает готовность полноценной beta: длительный beta error rate и RUM
не собраны, физические iOS/Android не проверены, тест минимум на 10 реальных
пользователях не проведён. Официальные цены Sports.ru временно исключены из
объёма владельцем продукта и не подменяются оценочными.

## Beta33 UI-density, worker и report acceptance 2026-07-16

Было:

- одни и те же ограничения состава повторялись верхними chips, строкой статуса и
  отдельными карточками стартового состава и скамейки;
- player pool был одновременно широким и глубоким: полные названия команд,
  многострочные строки и пять вертикальных fixture-pills;
- синхронный автоподбор удерживал main thread; synthetic INP одного предыдущего
  acceptance достигал 2 744 мс;
- production runtime не имел отдельного проверенного download endpoint для
  обезличенного beta-отчёта.

Стало:

- оставлены один общий статус конструктора и единственные полезные счётчики
  GK/DEF/MID/FWD внутри стартового состава; повторные `Поле/GK/DEF/MID/FWD` и
  `Запас/GK/Поле` checks удалены;
- desktop player table имеет фактическую ширину 744 px, шапку 35 px и первую
  строку 45 px; команда показывается как DB short name (`Man United`) с полным
  `Manchester United` в `title`, fixtures сведены к трём pills и доступному `+N`;
- общий document width на 1440 px равен 1440, на 390 px — 390; mobile использует
  cards, а скрытая desktop-таблица не расширяет страницу;
- worker chunk `fantasy-squad-optimizer.0c23200f3f451f13.js` вернулся HTTP 200;
  непрерывный замер дал 2 463 мс до 15/15 и event duration 128 мс. Максимальный
  long task при отрисовке результата был 483 мс, поэтому это техническое
  synthetic evidence, а не замена real-user RUM;
- USER получил ожидаемый 403 на `/api/admin/beta-test/report`; ADMIN получил 200,
  `Cache-Control: private, no-store`, attachment
  `beta-user-test-2026-07-16.json`, `application/json`. Скачанный отчёт — 2 574
  байта, SHA-256 `52d00fd16c8790dea6843dddd934f2ea649bb5804a9d13b8a3b3e66b08f86fe8`,
  без email, QA-name и `userId`;
- screenshots сохранены в
  `output/playwright/beta33-production-c4019ca/`; после cleanup восстановлены
  users 4, sessions 9, squads 2, squad players 30, runs 1, observations 20,
  real runs 0 и synthetic runs 1.

Полноценная beta этим не доказана: физические устройства, длительный real-user
RUM и выборка ≥10 участников по-прежнему отсутствуют.

## Beta32 physical-environment evidence acceptance 2026-07-16

До beta32 модератор мог упомянуть устройство только свободным текстом, поэтому
даже реально проведённый physical Safari iOS / Chrome Android тест нельзя было
надёжно доказать машинным отчётом. После beta32 valid review требует одно
структурированное значение из allowlist; база дополнительно применяет CHECK, а
gate требует минимум один primary physical Safari iOS и один physical Chrome
Android run. Несовпадение physical environment с desktop viewport отклоняется.

Canary `/admin/beta-test` проверен Playwright CLI на desktop и 390 px. Поле
`Observed device/browser` имеет `required=true`, пустое значение не отправляет
valid review, а allowlist содержит ровно `DESKTOP_BROWSER`,
`IOS_SAFARI_PHYSICAL`, `ANDROID_CHROME_PHYSICAL`, `OTHER_MOBILE`. На 390 px
`documentElement.scrollWidth = innerWidth = 390`; console errors/warnings — 0.
Одноразовые QA-user/run/session и credentials удалены, после cleanup в production
осталось 0 real, 0 valid real и 0 pending real runs. Это доказывает готовность
сбора evidence, но не заменяет сами физические тесты: счётчики iOS/Android всё
ещё 0/1 и 0/1.

## Beta32 WebKit/iPhone-profile acceptance 2026-07-16

Проверка выполнена напрямую на `https://fantasy.tsyzhman.ru`, потому что
production session cookie имеет `Secure`: loopback `http://` не является
допустимым доказательством authenticated client API. Первый loopback-сеанс дал
ожидаемые 401 именно из-за отсутствующего Secure-cookie и в результат не
засчитан. В новом чистом HTTPS-сеансе:

- WebKit `26.5`, iPhone 13 UA, viewport 390×664, DPR 3;
- `/machete/squad` и player pool загрузились под ролью `USER`; API squads и
  sync-status вернули 200;
- поиск `Bryan Mbeumo` оставил одну читаемую mobile-card с прогнозом и fixtures;
- Squad, Pool, Tips и global Menu доступны; Menu содержит Players и Sign out;
- `documentElement.scrollWidth = body.scrollWidth = innerWidth = 390`,
  page-level horizontal overflow отсутствует;
- console errors/warnings — 0; среди наблюдавшихся HTTPS-запросов нет 4xx/5xx;
- четыре просмотренных снимка сохранены локально в
  `output/playwright/beta32-webkit-iphone-{squad,pool,menu,tips}.png`.

Проверка была read-only: auto-pick/save/delete не запускались. Одноразовый
QA-пользователь и созданная login-сессия удалены каскадно; счётчики до и после
совпали: users 4, sessions 9, squads 2, real runs 0, synthetic runs 1;
QA-users после cleanup 0. Профиль сообщил `maxTouchPoints=0` и platform `Win32`,
поэтому physical Safari iOS и physical Chrome Android по-прежнему не закрыты.

## Beta31 clean-UI acceptance 2026-07-16

До правки `/machete/squad` повторял Machete hero, breadcrumbs и большую intro-card;
import/export/admin tools постоянно конкурировали с основным сценарием, метрики
занимали отдельные карточки, transfer tips шли до рабочего состава, а mobile pool
оставался широкой таблицей. Пустой состав назывался valid и позволял Save; option
смешивал EN/RU. После первой production-проверки дополнительно обнаружено, что на
360 px активная вкладка `Squad` обрезалась служебной подписью workspace.

После правки страница использует compact nav/title, data tools свёрнуты, метрики
собраны в strip, workbench поднят выше tips, а mobile pool отображается карточками.
Пустой состав показывает `15 players needed`, Save заблокирован до полного
допустимого состава, option одноязычный. На 360 px избыточная подпись скрыта,
поэтому `Leagues`, `Players` и активная `Squad` видны целиком.

Loopback beta31 canary дал 4/4 responsive passed; production workflow
`29503570431` дал 5 passed и 2 expected skipped. Во всех трёх viewport нет
document-level overflow и runtime 5xx/page errors. Одноразовый canary QA-user
удалён, canary удалён после production acceptance.

## Предыдущий UI-cleanup canary 2026-07-16

Новый UI-кандидат `fantasy-scout-web:ui-canary-v4-20260716T090327Z`
(`sha256:d268da9f88cf3c25e2ef0d3db4871462abab975e5cb86462530143fa04763b5d`)
проверен через постоянный Playwright Test suite, добавленный в репозиторий.
Canary работал с отключённым ingestion worker и read-only upload volume.

Итог полного прогона: 5 passed, 2 expected skipped. Полный сценарий с записью
выполняется только в desktop project; tablet/mobile projects не меняют данные.
Сценарий:

1. авторизовался отдельным QA-пользователем;
2. получил production player pool и выбрал игрока с прогнозом;
3. нашёл этого игрока в `/machete/players`;
4. открыл `/machete/squad`, создал пустой вариант и запустил auto-pick;
5. получил `Valid squad`, сохранил именованный вариант и проверил выбранный
   server-returned `squadId`;
6. удалил QA-вариант через authenticated browser fetch.

Responsive acceptance проверил 1440×1000, 1024×900 и Pixel 5. Во всех проектах
document-level horizontal overflow равен 0. На 1024 вкладка Pool видима и
открывает поиск игрока; на tablet/mobile global Menu содержит Players и Sign
out; desktop primary controls не пересекаются по bounding boxes. Скриншоты
прикладываются к CI artifacts. Desktop-проверка дополнительно открывает
`Ctrl+K` и подтверждает, что смонтирован ровно один dialog палитры команд.

## Исторический проверенный production/canary-объём beta33

| Сценарий | Viewport / выборка | Результат |
|---|---:|---|
| Геометрия `/machete/squad` | Production beta33, 1440×1000 | Повторные validation checks отсутствуют; player table 744 px, header 35 px, row 45 px; DB short names и 3 fixtures + `+N`; document 1440/1440; состав и pool видны рядом |
| Tablet gap | Production beta33 workflow, 1024×900 | Pool tab доступна, player search открывается; global Menu не обрезан; document overflow 0 |
| Mobile geometry | Production beta33 workflow Pixel 5 + Edge 390×844 | Pool использует cards вместо desktop table; Squad/Pool/Tips и global Menu доступны; document width 390/390; сохранённый 15/11/4 valid squad восстановлен |
| WebKit mobile geometry | Production beta32, WebKit 26.5, iPhone 13 UA, 390×664 | USER-login и authenticated pool API 200; поиск игрока, Squad/Pool/Tips и Menu работают; root/body width 390; console errors/warnings 0; наблюдавшихся 4xx/5xx нет. `maxTouchPoints=0`, поэтому physical/touch gate не закрыт |
| Полный automated journey | Production beta33, desktop | Реальный forecast pool загружен; worker auto-pick дал valid 15/11/4 и бюджет 100/100; вариант сохранён, восстановлен по `squadId`, QA-copy каскадно удалена |
| Поиск игрока `Mbeumo` | Production beta33, 1440×1000 | Bryan Mbeumo виден с FP 5.59, short team `Man United`, доступным full name и compact fixtures; document width 1440 |
| Сохранённый состав | Production beta33, desktop/mobile | `My squad · 15/15` восстановлен после reload: 15/15, 11/11, 4/4, valid, бюджет 100/100, без изменений к сохранённому |
| Автоподбор | Production beta33, Edge 1440×1000 | Worker chunk HTTP 200; 15/15 за 2 463 мс при лимите 5 с; synthetic event duration 128 мс, max result-render long task 483 мс; это не real-user RUM |
| Полный пул | Production beta33, desktop/mobile | Реальный EPL 2026/2027 pool загрузился; desktop table compact, mobile cards; ошибок загрузки нет, page-level overflow 0 |
| Трансферные рекомендации | Production beta33 | После автоподбора показаны 6 планов с прогнозным выигрышем, причинами и рисками на реальном pool; официальные цены не заявляются |
| Desktop-планировщик | Production beta33, 1440×1000 | Состав и compact pool помещаются рядом; short names берутся из DB; document overflow 0; intentional USER 403 проверен отдельно |
| Mobile-планировщик | Production beta33, 390×844 | Основной control stack, сохранённый valid squad и admin report page помещаются в 390 px; document overflow 0; physical/touch gate не закрыт |
| Маршрут `/machete/squad` | 10 авторизованных загрузок | Все ответы 200; выборка 343–2 439 мс, p75 480 мс, p95 2 439 мс; SMART-порог p75 ≤2,5 с выполнен |
| Пересчёт горизонта | 10 browser-переключений | Summary p75/p95 552/585 мс при лимите 1 с; трансферные рекомендации p75/p95 581/603 мс при лимите 10 с; каждый раз возвращены 6 планов; console errors 0 |
| Mixed load | beta22, 5 concurrent, 40 запросов | 40/40 GET 200; SSR p75/p95 369/678 мс, pool p75/p95 238/3 102 мс; production сохранил `healthy`, 0 рестартов и не создал новых error-логов |
| Длинный mixed load | beta17, 5 concurrent, 60 с | 1 362 GET-запроса, ошибок 0%; SSR p75 352 мс, pool API p75 85 мс; исторический референс для более длинной выборки |
| Beta telemetry и JSON-report | synthetic QA + production beta33 | Исторический synthetic run остаётся 1, real — 0; USER 403, ADMIN 200/no-store/attachment/no PII; admin UI честно показывает FAIL, 0/10 и physical 0/1 + 0/1 |
| `/api/health` | 20 HTTPS-запросов | Все ответы 200; p75 121,9 мс, p95 203,6 мс, максимум 203,7 мс, ошибок 0 |

Load-smoke воспроизводится командой `npm run beta:load`; точный профиль описан в
`docs/BETA_LOAD_TEST.md`. Короткий прогон с пятью конкурентными пользователями
не доказывает error rate за период реального beta-тестирования.

Финальный production workflow beta33 `29517734343` дал 5 passed и 2 expected
skipped; evidence сохранён в artifact `8383413207`. Отдельный monitor
`29517734277` завершился с 0 critical и 0 warning: 227 user-traffic запросов,
0 ответов 5xx, p75 37,322 мс, p95 218,53 мс. Это короткое окно не заменяет
длительный error-rate и RUM реальной beta.
Старый warning о preload логотипа устранён удалением ненужного `priority`.

Beta33 сохраняет исправления beta27: не регистрирует Web Vitals observers заново
при каждом тике таймера, делает повтор POST telemetry идемпотентным и строит RUM по всем
реальным прогонам, включая pending/invalid/failed. После synthetic smoke в
production за 30 дней остаётся `1` synthetic и `0` real runs: QA не засчитан как
человек и RUM-гейт остаётся FAIL.

## Точный сохранённый результат

- Пользовательский вариант: `My squad`.
- ID: `cmrm8rrsd0001me4e8okeccii`.
- Лига и сезон: EPL `47`, `2026/2027`.
- Состав: 15/15; старт 11/11; скамейка 4/4.
- Бюджет: 100/100; банк 0.
- Стартовый XI по турам 1–10: 48,4 / 51,6 / 49,1 / 51,2 / 49,6 / 49,9 /
  50,0 / 49,8 / 50,5 / 49,3 FP.
- Официальные Sports.ru-цены: 0; оценочные цены: 629. Интерфейс помечает их
  как оценочные и не маскирует под официальные.

## Эволюция мобильного Pool

До финальной правки при viewport 360 px вкладки Squad и Tips имели ширину
документа 360 px, но широкая таблица Pool расширяла `documentElement` до 765 px.
Внутренний `overflow-auto` имел правильную ширину 300 px, однако без отдельного
positioned containing block Chromium включал таблицу шириной 760 px в корневой
scroll width.

После добавления `position: relative` контейнеру внутренней прокрутки Pool:

- `documentElement.scrollWidth = 360`;
- `body.scrollWidth = 360`;
- таблица оставалась шириной 760 px и прокручивалась только внутри контейнера;
- результат был одинаков на canary, production beta16, beta17 и beta22.

В beta31 мобильный Pool больше не использует широкую таблицу: до breakpoint `md`
он отображает отдельные player cards, а desktop/tablet сохраняют таблицу. Поэтому
на Pixel 5 нет ни page-level, ни внутреннего табличного горизонтального скролла.

## Что эта проверка не доказывает

- Постоянный desktop/tablet/mobile browser-smoke теперь есть; он проверяет
  viewport geometry, доступность Pool/Menu, runtime 5xx/page errors и полный
  основной сценарий. Pixel-diff baseline намеренно не используется между
  Windows и Linux из-за различий font rendering; screenshots сохраняются как
  CI evidence.
- Автоматизированный axe-аудит того же UI на beta21 desktop/mobile дал 0
  нарушений, а production beta22 keyboard-check прошёл в Edge. Это не заменяет
  проверки на реальных Safari iOS и Chrome Android. Помимо Chromium/Edge
  viewport теперь проверен WebKit 26.5 с iPhone UA на 390×664, но
  `maxTouchPoints=0`, platform `Win32`, физического устройства не было.
- Есть воспроизводимый mixed load-smoke; нет длительного RUM/Web Vitals и
  подтверждённого error rate за период реального beta-тестирования.
- Нет минимум 10 независимых участников и completion rate ≥80% по протоколу
  `docs/BETA_USER_TEST_PROTOCOL.md`.
- Реальные Sports.ru-цены отсутствуют: официальный GraphQL возвращает
  `currentSeason: null`, поэтому планировщик честно использует оценочные цены.
