# WI-030: исследование Sports и production

Дата: 2026-09-25. Режим: read-only; без изменения production, вывода секретов, отправки Telegram-сообщений или массовой нагрузки.

## Sports {#sports}

Проверен [материал Sports о покупках и продажах перед вторым туром ЧМ](https://www.sports.ru/football/1117257620-populyarnost-kiliana-mbappe-pered-2-m-turom-fentezi-chm-vyrosla-na-9-6.html). Статья содержит два нумерованных рейтинга; серверный HTTP 200, примерно 667–668 KB HTML. Простая проверка видимого HTML без script/style извлекла **10 позиций покупок и 10 продаж**. Листинги представлены текстом, браузер/OCR для этого примера не нужны.

JSON-LD `NewsArticle.articleBody` оказался анонсом длиной 119 символов, без рейтингов. Дата публикации в JSON-LD: `2026-06-18T17:25:00+03:00`. Это важное ограничение: парсер только JSON-LD потеряет список; сбор в 09:00 не может получить публикацию будущего времени. Проверка обнаружения слова captcha в общем HTML дала true из-за включённых скриптов/текста, но нужный контент успешно разобран; поиск одного слова не является доказательством challenge page.

Через существующий GraphQL endpoint Sports с production выполнены **два read-only запроса**: currentSeason для `england`, затем 15 FORWARD с сортировкой BY_PRICE. Ответ: seasonId `81`, 15 игроков, 15 непустых `status.selectedBy`, без GraphQL errors. Это проверка поля и доступности, **не получение общего топ-15** и не доказательство API покупок/продаж. Значения процента выбора уже поступают в существующий ценовой импорт.

Не проверено: стабильность HTML на всех видах материалов, регулярность топов всех лиг, full-pool ranking в новом модуле, batch/private API и provider quota для миллиона профилей. Статья доказывает техническую извлекаемость опубликованных списков, а не SLA их наличия.

## Сервер {#server}

Доступ взят из локального SSH config: alias `deploy`, ключ из IdentityFile. Содержимое ключа, окружение с паролями и Telegram/Sports credentials не выводились. Проверки 10:12–10:17 МСК; снимки нагрузки моментальные.

| Объект | Проверенный факт |
|---|---|
| ОС/runtime | Docker, отдельные fantasy-scout-web / worker / postgres и fpl-relay; рядом работают другие приложения |
| Release | 0.3.85, commit `047b987960ee71ff7eb0f08e7ebaf5d875c03a22` |
| Current | `/var/www/fantasy-scout-releases/20260921T163453Z-v0.3.85-047b987` |
| Проверка revision | /api/health, .release-commit и image label web/worker совпали |
| Health | web и worker healthy; restartCount 0, OOMKilled false |
| CPU/RAM | 8 vCPU; total 11876 MiB; available 5325 MiB; swap 0 |
| Контейнерная память | worker 2,253 GiB, web 690,6 MiB, postgres 1,729 GiB, relay 27,05 MiB |
| Resource limits | web/worker/postgres: Docker memoryLimit=0 и NanoCpus=0; это отсутствие явно заданных ограничений |
| Диск / | 119 GB total, 32 GB used, 81 GB available, 28% |
| Docker build cache | 1,756 GB total, 796,4 MB reclaimable; общий host, не только Fantasy |
| Docker images/containers | 44 образа (42 active), 51 контейнер (43 active); наличие rollback не считается случайным дублем |
| Логи Fantasy | json-file, 20m × 5 для web/worker/postgres |
| БД | 2 491 374 615 bytes (~2,32 GiB), connections 30 / max 100 во время запроса |
| Пользователи | 30 всего, 28 active; 17 привязок публичного Sports профиля |
| Составы | 144 сохранённых UserFantasySquad, 640 SportsRuSquadSnapshot |
| Популярность | 10 376 price rows, 9130 с непустым selected_by_percent; это весь прочитанный набор, не только актуальный сезон |
| Дубли Sports IDs | 0 групп повторного provider_user_id среди 17 Sports профилей; полный аудит всех таблиц не выполнялся |
| Telegram | нет TELEGRAM_* env keys в web/worker; в прочитанной schema/коде нет целевого модуля |

Память Docker stats учитывается отдельно от host available; нельзя складывать эти цифры как независимые расходы. Проценты CPU — короткий snapshot, не benchmark. Свободное место не является доказательством capacity для million-user очередей.

### Расписания и покрытие

- Worker: `MACHETE_DAILY_SYNC_ENABLED=true`, `MACHETE_DAILY_SYNC_TIME=03:00`, timezone Europe/Moscow.
- Worker: `SORAREINSIDE_SYNC_ENABLED=true`; код и активная INFRA-004 задают запуск каждый час :05. В web daily/Sports/odds scheduler flags выключены.
- Sports sync scopes worker: `63:2026/2027:russia;87:2026/2027:spain;57:2026/2027:netherlands;61:2026/2027:portugal`.
- Флаг SPORTS_RU_SQUAD_SYNC_ENABLED в allowlist env отсутствует: его поведение определяется defaults кода, отсутствие переменной не означает false.
- На host активны fantasy-khl-statistics.timer (:22) и fantasy-franchises.timer (раз в 3 часа :47). Новый утренний pipeline должен учитывать конкуренцию за общий worker/БД.
- Из ближайших прочитанных будущих provider rounds: Россия/Португалия/Нидерланды/Испания fetchedAt 25 сентября; Чемпионшип/Германия/Франция/Англия — 18 сентября. В БД Англия: startsAt `2026-10-10T11:30Z`, deadlineAt `2026-10-10T14:00Z`; Германия: startsAt `2026-10-09T18:30Z`, deadlineAt `2026-10-10T00:00Z`. Это **конфликт для проверки**, а не установленный настоящий дедлайн. Причина в этом проходе не исправлялась.
- Текущий `sports_ru_fantasy_sync.ts` записывает deadlineAt из `tour.startedAt`. Нужна проверка семантики источника, timezone и соответствия earliest fixture до отправки пользователям.

### Как проверяли

Использованы SSH read-only команды: date, nproc, free, df, readlink, release manifest, docker ps/stats/system df, выборочные container inspect поля, systemctl list-timers, локальный HTTP health. Полный Docker environment не печатался: скрипт выводил только заранее разрешённые schedule flags и имена TELEGRAM_* ключей.

Prisma-запросы исполнялись в `SET TRANSACTION READ ONLY`: агрегаты count, размер БД/число соединений, 8 ближайших rounds, count duplicate source groups. Первая попытка SQL JOIN использовала несуществующее имя таблицы fantasy_contests и была отклонена PostgreSQL; повтор использовал Prisma relation. Данных первая транзакция не меняла. Новые процессы завершались, Prisma disconnect вызван.

## Что уже есть в коде {#code}

| Путь | Значение для задачи |
|---|---|
| `src/components/sports-ru-profile-settings.tsx` | Прямо предупреждает: доступен последний опубликованный состав, открытый состав приватен; пароль/cookies не собираются |
| `src/lib/providers/sports-ru-fantasy.ts` | selectedBy, currentSeason/tours, публичные squads и fallback к опубликованным турам |
| `src/machete/sports_ru_fantasy_sync.ts` | Сохранение selectedBy и provider rounds; deadlineAt из startedAt |
| `src/machete/sports_ru_squad_snapshots.ts` | Снимки после старта + 30 минут, retry/lease; нельзя считать готовым утренним импортом |
| `src/server/sports-ru-squad-snapshot-scheduler.ts` | Цикл каждые 5 минут по заданным scopes |
| `src/server/machete-daily-sync.ts` | 03:00, ожидание ingestion job, затем Sports sync |
| `src/server/fixture-odds-scheduler.ts` | Собственные daily/final triggers, ограниченные retries |
| `src/machete/sorareinside-sync.ts`, INFRA-004 | XI ближайшего матча клуба; другой турнир может оказаться ближайшим |
| `src/machete/fantasy-player-pool-snapshots.ts` | CURRENT_XI и контроль revision; общий materialized read model |
| `src/machete/squad_planner.ts`, `squad_logic.ts` | alternativePredictedFp и alternativeRoundPoints; нужно выбирать target round и ту же модель |
| `src/instrumentation.ts` | Разделение scheduler ролей; отдельный delivery не должен запускать все loops |
| `extensions/sports-squad-transfer/README.md` | Существующее направление Scout → Sports, не обратный unattended import |
| `prisma/schema.prisma` | User, ExternalProfile, FantasyProviderRound/Fixture, SportsRuSquadSnapshot; не плодить копии каталога |

Обнаруженный edge case: `sportsRuSelectedByPercent` преобразует значение через Number до проверки null. `Number(null)=0`, поэтому будущая работа по достоверности popularity должна отличить неизвестное от нуля и не полагаться на исторический ноль как гарантированно подтверждённый. В этой документирующей задаче код не исправлялся.

## Исследованные внешние источники {#sources}

Поиск начат до проектирования с Sports, Reddit и Stack Overflow. Форумные ответы помогли выявить привычный flow deep link и проблему delivery limits; технические контракты проверены по первичным источникам, форум не является основанием для лимитов или безопасности.

- [Sports: проверенная статья](https://www.sports.ru/football/1117257620-populyarnost-kiliana-mbappe-pered-2-m-turom-fentezi-chm-vyrosla-na-9-6.html) и [лента Fantasy](https://www.sports.ru/fantasy-sports/news/) — наличие и discovery материалов.
- [Telegram deep linking](https://core.telegram.org/bots/features#deep-linking) — start payload; до 64 разрешённых символов, base64url подходит.
- [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage) — текст, HTML formatting, лимит 4096, paid broadcasts.
- [Telegram webhook](https://core.telegram.org/bots/api#setwebhook) — secret token и доставка updates.
- [Telegram FAQ: broadcasts](https://core.telegram.org/bots/faq#broadcasting-to-users) — ~30/с бесплатно, до 1000/с paid, условия eligibility и Stars. Значения проверены 25 сентября, перед production перепроверить.
- [Stack Overflow: authentication in Telegram bot](https://stackoverflow.com/questions/31042219/how-do-i-get-authentication-in-a-telegram-bot) — исследованный пример связывания сайта с ботом через одноразовый deep link.
- [Reddit: high-volume bot messaging](https://www.reddit.com/r/SaaS/comments/1rtrixz/suggestion_on_highvolume_messaging_tools_for/) — исследованная постановка проблемы очереди, pacing и retries; рекламные рекомендации не использованы.

## Ограничения результата {#limits}

Не выполнены: создание бота/token/webhook, миграции, parser production job, автоматический импорт утром, Sorare refresh, массовая Telegram рассылка или нагрузочный тест. Не установлены подтверждённый официальный private Sports API и quota. Server health подтверждает работоспособность текущего release, не готовность новой функции или capacity миллиона пользователей.

Контроль кэша: лишние демоны/браузеры/контейнеры не запускались, raw Sports HTML на диск не сохранялся, данные скачивались ограниченными HTTP reads. Shared Docker build cache не очищался: это не задача изменения сервера, а наблюдаемая общая величина.

Повторная проверка в **10:25 МСК**: host available 5315 MiB (первый замер 5325); worker 2,263 GiB, web 690,7 MiB, postgres 1,726 GiB. Health/release прежние; одна рабочая пара web/worker, relay и postgres, плюс остановленная штатная rollback-тройка. Новых работающих копий нет. Build cache прежний 1,756 GB. Это два контрольных замера без внесённых runtime изменений, не доказательство отсутствия утечки на длительной дистанции. Итог spec diagnostics записывается в Result WI.
