# Browser Beta Check

Дата проверки: 2026-07-16.

Финальная browser-проверка выполнена GitHub Actions Playwright Test workflow
`29494531024` против production `https://fantasy.tsyzhman.ru` на образе
`fantasy-scout-web:beta27-20260716T111950Z` с image ID
`sha256:5158ff770d1b55de3ebb8e4ecb2ddbf71952d882109922fd8d9d286952e9812a`
и source commit `4ac9b34cb6bc5f312909473743b95ad0a34f8da6`.

Workflow дал 5 passed, 2 expected skipped за 56,3 с. Evidence загружен в
artifact `production-browser-smoke-29494531024` (`8373836399`). Использован
отдельный production QA-пользователь; пароль хранится только в GitHub Secrets.
Write-сценарий создаёт уникальный `E2E optimized …` вариант, проверяет
server-returned `squadId` и удаляет QA-копию; рабочие пользовательские данные не
меняются.

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

## UI-cleanup canary 2026-07-16

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
| Clean UI `/machete/squad` | Production beta27, 1440×1000 | Save/auto-pick/more actions не пересекаются; player pool виден; `Ctrl+K` открывает один dialog; document overflow 0; runtime 5xx/page errors в тесте 0 |
| Tablet gap | Production beta27, 1024×900 | Pool tab доступна, player search открывается; global Menu не обрезан; document overflow 0 |
| Mobile clean UI | Production beta27, Pixel 5 | Squad/Pool/Tips, workspace grid и global Menu доступны; document overflow 0; runtime 5xx/page errors в тесте 0 |
| Полный automated journey | Production beta27, desktop | Реальный forecast player найден; auto-pick дал valid squad; вариант сохранён и QA-copy удалена |
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

Финальный production workflow beta27 дал 0 захваченных page errors и runtime
5xx в тестовых сценариях. Отдельный часовой Caddy audit остаётся более строгим
источником для всего трафика и не заменяется этим коротким smoke.
Старый warning о preload логотипа устранён удалением ненужного `priority`.

Beta27 также исправляет повторную регистрацию Web Vitals observers при каждом
тике таймера, делает повтор POST telemetry идемпотентным и строит RUM по всем
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

## Исправленный мобильный дефект Pool

До финальной правки при viewport 360 px вкладки Squad и Tips имели ширину
документа 360 px, но широкая таблица Pool расширяла `documentElement` до 765 px.
Внутренний `overflow-auto` имел правильную ширину 300 px, однако без отдельного
positioned containing block Chromium включал таблицу шириной 760 px в корневой
scroll width.

После добавления `position: relative` контейнеру внутренней прокрутки Pool:

- `documentElement.scrollWidth = 360`;
- `body.scrollWidth = 360`;
- таблица остаётся шириной 760 px и прокручивается только внутри контейнера;
- результат одинаков на canary, production beta16, beta17 и beta22.

## Что эта проверка не доказывает

- Постоянный desktop/tablet/mobile browser-smoke теперь есть; он проверяет
  viewport geometry, доступность Pool/Menu, runtime 5xx/page errors и полный
  основной сценарий. Pixel-diff baseline намеренно не используется между
  Windows и Linux из-за различий font rendering; screenshots сохраняются как
  CI evidence.
- Автоматизированный axe-аудит того же UI на beta21 desktop/mobile дал 0
  нарушений, а production beta22 keyboard-check прошёл в Edge. Это не заменяет
  проверки на реальных Safari iOS и Chrome
  Android; финальная production-проверка выполнена в Edge viewport 390×844.
- Есть воспроизводимый mixed load-smoke; нет длительного RUM/Web Vitals и
  подтверждённого error rate за период реального beta-тестирования.
- Нет минимум 10 независимых участников и completion rate ≥80% по протоколу
  `docs/BETA_USER_TEST_PROTOCOL.md`.
- Реальные Sports.ru-цены отсутствуют: официальный GraphQL возвращает
  `currentSeason: null`, поэтому планировщик честно использует оценочные цены.
