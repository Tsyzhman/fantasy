# Browser Beta Check

Дата проверки: 2026-07-16.

Финальная browser-проверка выполнена GitHub Actions Playwright Test workflow
`29507456004` против production `https://fantasy.tsyzhman.ru` на образе
`fantasy-scout-web:beta32-20260716T141021Z` с image ID
`sha256:bc3560ea302dabc5b28e3acf48062f08f30749a0052a6e4f5a013351f538f75c`
и source commit `5be7247ba08d70c342915d884e0ee2ed4eacdb68`.

Workflow дал 5 passed, 2 expected skipped за 1,0 минуту. Evidence загружен в
artifact `production-browser-smoke-29507456004` (`8379167025`). Использован
отдельный production QA-пользователь; пароль хранится только в GitHub Secrets.
Write-сценарий создаёт уникальный `E2E optimized …` вариант, проверяет
server-returned `squadId` и удаляет QA-копию; рабочие пользовательские данные не
меняются.

Этот smoke подтверждает работоспособность сценария и отсутствие измеримого
viewport overflow. Production screenshots дополнительно просмотрены вручную на
1440×1000, 1024×900 и Pixel 5; отдельный технический и визуальный clean-UI gate
закрыт. Понятность для аудитории он не доказывает — это остаётся частью теста на
10 реальных пользователях.

Дополнительно выполнен одноразовый acceptance на публичном production HTTPS в
Playwright CLI `0.1.17`, browser engine WebKit `26.5`, с iPhone 13 UA и viewport
390×664 при DPR 3. Обычный пользователь авторизовался, открыл `/machete/squad`,
загрузил реальный player pool, нашёл Bryan Mbeumo, переключил Squad/Pool/Tips и
открыл global Menu. В принятом HTTPS-сеансе console errors/warnings — 0, все
наблюдавшиеся API/RSC-запросы — 200, login POST — 303, root/body scroll width —
390 px. Инструмент сообщил `maxTouchPoints=0`, поэтому это проверка WebKit и
мобильной геометрии, а не полноценная touch-эмуляция и не физический Safari iOS.

## Итог

Технический основной сценарий работает в production: поиск игрока возвращает
реального игрока и прогноз, переход в планировщик доступен, полный пул
догружается, сохранённый оптимизированный состав восстанавливается после reload,
автоподбор и трансферные рекомендации работают. Desktop и мобильный viewport
проходят без console errors и без горизонтального скролла всего документа.

Это не означает готовность полноценной beta: длительный beta error rate и RUM
не собраны, физические iOS/Android не проверены, тест минимум на 10 реальных
пользователях не проведён. Официальные цены Sports.ru временно исключены из
объёма владельцем продукта и не подменяются оценочными.

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

## Проверенный production/canary-объём

| Сценарий | Viewport / выборка | Результат |
|---|---:|---|
| Геометрия `/machete/squad` | Production beta31, 1440×1000 | Compact header; Save/auto-pick/more actions не пересекаются; workbench и player pool видны в первом viewport; `Ctrl+K` открывает один dialog; document overflow 0; runtime 5xx/page errors 0 |
| Tablet gap | Production beta31, 1024×900 | Pool tab доступна, player search открывается; global Menu не обрезан; document overflow 0 |
| Mobile geometry | Production beta31, Pixel 5 | `Leagues`, `Players` и активная `Squad` целиком видны; Pool использует cards вместо desktop table; Squad/Pool/Tips и global Menu доступны; document overflow 0; runtime 5xx/page errors 0 |
| WebKit mobile geometry | Production beta32, WebKit 26.5, iPhone 13 UA, 390×664 | USER-login и authenticated pool API 200; поиск игрока, Squad/Pool/Tips и Menu работают; root/body width 390; console errors/warnings 0; наблюдавшихся 4xx/5xx нет. `maxTouchPoints=0`, поэтому physical/touch gate не закрыт |
| Полный automated journey | Production beta31, desktop | Реальный forecast player найден; auto-pick дал valid squad; вариант сохранён и QA-copy удалена |
| Поиск игрока `Mbeumo` | beta16, 1440×900; код пути не менялся в beta22 | HTTP 200 за 507 мс; найден Bryan Mbeumo, прогноз виден, ссылка `Build squad` ведёт в EPL 2026/2027; document width 1440; console errors 0 |
| Сохранённый состав | desktop/mobile | Вариант `My squad` восстановлен без изменений: 15/15 игроков, 11 стартовых, 4 запасных, бюджет 100/100, банк 0 |
| Автоподбор | production beta14, та же planner-логика в beta22 | 2,903 с при SMART-лимите 5 с; последующий reload вернул сохранённый состав без расхождений |
| Полный пул | beta22, 390×844 | API вернул 629 игроков, ошибки загрузки отсутствуют; root/body overflow 0 |
| Трансферные рекомендации | beta22, 390×844 | Вкладка Tips показывает планы, причины и риски; root/body overflow 0 |
| Desktop-планировщик | beta22, 1440×900 | root/body overflow 0, сохранённый вариант, полный пул и рекомендации доступны; 3/3 navigation-landmark имеют имена; console errors/warnings 0 |
| Mobile-планировщик | beta22, 390×844 | Squad, Pool и Tips переключаются кликом и ArrowLeft/ArrowRight с wrap, focus и `tabIndex=0`; root/body overflow 0; console errors/warnings 0 |
| Маршрут `/machete/squad` | 10 авторизованных загрузок | Все ответы 200; выборка 343–2 439 мс, p75 480 мс, p95 2 439 мс; SMART-порог p75 ≤2,5 с выполнен |
| Пересчёт горизонта | 10 browser-переключений | Summary p75/p95 552/585 мс при лимите 1 с; трансферные рекомендации p75/p95 581/603 мс при лимите 10 с; каждый раз возвращены 6 планов; console errors 0 |
| Mixed load | beta22, 5 concurrent, 40 запросов | 40/40 GET 200; SSR p75/p95 369/678 мс, pool p75/p95 238/3 102 мс; production сохранил `healthy`, 0 рестартов и не создал новых error-логов |
| Длинный mixed load | beta17, 5 concurrent, 60 с | 1 362 GET-запроса, ошибок 0%; SSR p75 352 мс, pool API p75 85 мс; исторический референс для более длинной выборки |
| Beta telemetry | synthetic QA | 8 этапов в правильном порядке, 2 page views, 10 Web Vitals, 0 client errors; report видит 1 synthetic и 0 реальных участников, поэтому gate остаётся FAIL |
| `/api/health` | 20 HTTPS-запросов | Все ответы 200; p75 121,9 мс, p95 203,6 мс, максимум 203,7 мс, ошибок 0 |

Load-smoke воспроизводится командой `npm run beta:load`; точный профиль описан в
`docs/BETA_LOAD_TEST.md`. Короткий прогон с пятью конкурентными пользователями
не доказывает error rate за период реального beta-тестирования.

Финальный production workflow beta32 дал 0 захваченных page errors и runtime
5xx в тестовых сценариях. Отдельный часовой Caddy audit остаётся более строгим
источником для всего трафика и не заменяется этим коротким smoke.
Старый warning о preload логотипа устранён удалением ненужного `priority`.

Beta32 сохраняет исправления beta27: не регистрирует Web Vitals observers заново
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
