---
status: active
---

# INFRA-005: Подготовка и доставка отчётов дедлайна {#root}

## Простыми словами {#plain-language}

Один общий процесс обновляет спортивные данные, отдельные задания готовят персональные отчёты, а очередь дозирует отправку Telegram. Перезапуск не теряет кампанию. Миллион зарегистрированных аккаунтов не означает миллион одновременно выполняемых парсеров. Конкретное время завершения рассылки ограничено Telegram, Sports и скоростью наших расчётов.

## Цель {#goal}

Подготовить согласованные по версиям данные дедлайна и доставить их подписчикам в измеренном временном окне с ограниченной памятью, повторяемым восстановлением и контролем внешних лимитов.

## Управляющие документы {#governing-specs}

Governing product proposal: `spec://modules/telegram/FEAT-007-deadline-assistant#root`; источник: `spec://modules/machete/FEAT-006-sports-popularity#root`; обязательное действующее ограничение Sorare: `spec://modules/machete/INFRA-004-sorareinside-starters#root`. Legacy deployment contract: `docs/DEPLOYMENT.md`.

## Границы {#scope}

Входит: deadline registry, оркестрация обновлений, immutable input версии, очередь, retries, метрики и rollout. Не входит: замена текущих provider adapters, переезд всей инфраструктуры, включение платных Stars или запуск реализации этим документом.

## Окружение и исходная точка {#environments}

Production исследован через SSH alias `deploy` 2026-09-25. Факты и воспроизводимые проверки — [evidence](../../work/evidence/WI-030/research.md#server). Next.js web и отдельный Docker worker уже существуют; PostgreSQL — общая БД проекта. В проекте не обнаружены Telegram tables/env/webhook. Redis другого приложения на том же сервере не является зависимостью Fantasy Scout.

## Канонические решения проекта {#decisions}

Предлагаемый первый выпуск: профиль и webhook в web; orchestration в выделенной worker-роли; доставка в отдельном ограниченном процессе/container, который не запускает остальные scheduler через instrumentation. PostgreSQL — durable inbox, campaign jobs и outbox; захват небольшими пачками через `FOR UPDATE SKIP LOCKED`, lease и fencing token. Не добавлять Redis только ради миллиона строк пользователей. Для нескольких delivery replicas общий limiter обязателен: один координатор или отдельный Redis Fantasy с атомарными token buckets; его отказ закрывает отправку, а не снимает лимиты.

Для большого масштаба web, ingest, report-build и delivery масштабируются отдельно; внешние лимиты Sports/Telegram от этого не увеличиваются. Текущий общий сервер с другими приложениями не сертифицирован для миллиона подписчиков; размер отдельной инфраструктуры выбирается нагрузочным тестом.

## Источник дедлайна {#deadlines}

Ключ кампании: `(provider=SPORTS_RU, contestId, season, providerRoundId)`. Читать `FantasyProviderRound` и `FantasyProviderFixture`; хранить дедлайн в UTC, планирование и дату выбирать через IANA `Europe/Moscow` (08:00/08:10/09:00 соответствуют 05:00/05:10/06:00 UTC). Номер тура берётся у провайдера, не у FotMob.

Нельзя вслепую использовать имеющийся `deadlineAt`: текущий sync получает его из `tour.startedAt`, а обследование выявило сроки позже первого матча и старые fetch timestamps. Gate до запуска: сверить реальный Sports deadline/current tour с fixtures и Sports UI/контрактом провайдера на поддерживаемой лиге; сохранить `deadlineSource`, `verifiedAt`, `scheduleVersion`. `deadlineAt > earliestEligibleKickoff` при неоговорённых правилах — `DEADLINE_CONFLICT`, без уведомления с ложным временем. Не исправлять разницу часов эвристикой и не выдавать первый kickoff за подтверждённый deadline. Если точный срок не доказан, операторский alert и отключение кампании до исправления.

Планировщик каждую минуту выбирает due jobs из БД, а не держит таймер на каждого пользователя. Общий lookahead 14 дней; календарь обновлять хотя бы ежедневно, в день дедлайна при 08:00 и 08:10, перед заморозкой снова валидировать. Для всех подписанных contest включить discovery/sync: существующего списка четырёх лиг недостаточно.

Изменившийся до отправки дедлайн переустанавливает dueAt несостоявшихся этапов; providerRoundId и logical report key сохраняются. После отправки перенос не создаёт дубликат; отдельные корректирующие сообщения требуют отдельной утверждённой политики. Отмена тура отменяет unsent jobs. Late discovery после 09:00 допускает немедленную помеченную позднюю подготовку только при запасе до дедлайна, без тихого переноса на завтра.

## Pipeline 08:00 → 08:10 → 09:00 {#pipeline}

### Runtime и операции {#runtime}

| МСК | Действие | Критерий результата |
|---|---|---|
| 08:00 | Зафиксировать подписчиков для кампании; начать bounded import последнего доступного Sports состава | Снимок каждой выбранной команды или явное unavailable; не требуется приватный будущий состав |
| 08:10 | Запустить общий incremental refresh статистики, fixtures, fantasy prices/popularity, кэфов Fonbet, прогнозов SorareInside | job IDs и результаты по каждому dataset/contest; «поставлено в очередь» не равно «обновлено» |
| По готовности | Пересчитать модель/ALT и материализовать нужные player pools после статистики, кэфов и XI | READY snapshot с входными revisions, моделью и временем; считать один раз на эквивалентный scope |
| До 08:50 | По мере готовности строить отчёты; 08:50 — cutoff источников и финальная фиксация campaign input version | READY либо DEGRADED с точными missing/stale datasets; поздняя запись не меняет уже готовый отчёт |
| 09:00 | Открыть очередь доставки и отправлять готовые сообщения в рамках quota | Начало рассылки, а не обещание одновременной доставки всем |

Обновление «всей статы» — incremental актуальных данных всех лиг, участвующих в дедлайнах, включая необходимые общие ростеры/календарь; не полный historical backfill на каждого пользователя. Архивный backfill остаётся отдельной работой. Refresh для нескольких кампаний одной даты использует общий dataset job, составы — общий fetch на уникальный `(providerProfileId, providerSquadId, providerSeasonId)`, затем отдельные пользовательские ссылки/доступ.

В 08:10 запускается явный refresh; если уже идёт эквивалентный актуальный job, pipeline подписывается на его результат. Завершённый раньше запрос не выдавать за новый refresh, если его fetchedAt не удовлетворяет политике. Существующие 03:00 FotMob, hourly :05 Sorare, odds triggers и новая оркестрация используют один provider lock и bounded concurrency. Критерии готовности — не только completed job, но полнота целевого scope, возраст и соответствие revisions. `completed_with_errors` требует dataset-level проверки.

Sorare: обычный importer продолжает выполнять INFRA-004 про ближайший матч клуба. Для другого матча целевого тура отчёт использует отдельное fixture-specific evidence из API либо `UNKNOWN`; нельзя молча переносить прогноз кубка на лигу или менять глобальные галочки под нужды бота. Нет прогноза — не основание очистить XI. Rollout включает отдельную проверку доступности прогнозов на конкретные fixtures.

Ночные/ранние дедлайны ≤09:00: предлагается предыдущий день с теми же часами и явной датой, REVIEW по FEAT-007. Без принятого решения не запускать заведомо опоздавший обычный сценарий. Дедлайн сразу после 09:00 также проходит capacity gate.

## Freshness и деградация {#freshness}

Проектные начальные пороги, проверяемые пилотом:

- Sports состав: попытка с 08:00, fetchedAt и sourceTourId обязательны; древний опубликованный состав остаётся древним даже после успешной проверки HTTP.
- Календарь/дедлайн: успешная проверка этого утра, целевая полнота fixtures и отсутствие конфликтов. Неизвестный календарь запрещает `BLANK`.
- Статистика: последняя успешная ночная выгрузка не старше 24 часов допустима только как degraded fallback; полным утренним обновлением считается результат refresh после 08:10.
- Кэфы: свежая попытка после 08:10; fallback до 6 часов явно помечается, старше — unavailable для текущего market-based расчёта.
- XI: fixture-specific evidence с проверкой после 08:10; fallback до 2 часов помечается, неверный матч/прошедший kickoff всегда UNKNOWN. Прогноз не превращается в официальный старт.
- ALT: модель, target round и input revisions обязаны совпасть с закреплённым snapshot. Нельзя смешать новый XI и старый ALT, назвав их одним актуальным расчётом.

На cutoff неполные данные остаются в отчёте с отметками; старый READY snapshot сохраняется для сайта. Нет валидного дедлайна/идентичности адресата — отправка закрыта. Нет новых кэфов или топа покупок — рассылка не блокируется целиком. После cutoff изменения не редактируют сообщения автоматически; повторный просмотр на сайте может показывать более свежую версию.

## Данные и конкурентность {#data}

| Сущность | Ключи/состояние |
|---|---|
| `TelegramInbox` | UNIQUE(botId, updateId), receivedAt, processedAt, state; webhook подтверждается 2xx только после durable commit |
| `DeadlineCampaign` | UNIQUE(contestId, season, providerRoundId), deadlineAt, scheduleVersion, due times, inputVersion, status |
| `DeadlineStageJob` | UNIQUE(campaignId, stage, inputVersion, shardKey), queued/running/succeeded/degraded/failed/cancelled, leaseUntil, fence, attempts, nextAttemptAt |
| `DeadlineDataSnapshot` | общие versioned dataset references, modelRevision, round, coverage/freshness; полные пулы не копировать в каждый отчёт |
| `DeadlineUserReport` | UNIQUE(userId, campaignId, reportVersion), input snapshot refs, source squad ref/version, findings, immutable renderHash |
| `TelegramOutbox` | UNIQUE(userId, campaignId, reportKind, partNumber), reportVersion, linkVersion, state, nextAttemptAt, attempts, telegramMessageId, sentAt; индекс очереди по state/nextAttemptAt |

`reportVersion` не входит в уникальный logical delivery key: пересборка обновляет unsent запись, а не создаёт вторую утреннюю отправку. Для intentional correction нужен другой reportKind и явная политика. Notification jobs берут user consent/linkVersion непосредственно перед external side effect; pause/unlink/удаление и поздние worker completions не могут восстановить отозванную связь.

Миграции только additive через versioned Prisma. Транзакции короткие; HTTP не держит DB transaction/connection. Каждый lease имеет expiry и fencing token, старый worker не публикует результат поверх нового. Batch claims и отчёты ограничены 100–500 записями и keyset pagination; миллиона объектов/Promise.all в памяти нет.

## Telegram delivery и неоднозначный результат {#delivery}

Webhook проверяет `X-Telegram-Bot-Api-Secret-Token`, HTTPS, Content-Type, размер и допустимые update types; bot token хранится только в secret env выделенного backend. Группы не могут привязать аккаунт. Повторы updates поглощает inbox. Вызовы Bot API отдельными HTTPS requests, не webhook inline response, чтобы сохранять результат и message_id. В production исходящие запросы Bot API идут через существующий VPN relay (тот же Unix-сокет, что у FPL relay, с allowlist `sendMessage`/`setWebhook`); прямое обращение к `api.telegram.org` без VPN namespace не используется, токен не логируется и не попадает в URL-логи.

Если входящие соединения Telegram до хоста недоступны (подтверждено отсутствием запросов Telegram в access-логе при работающих внешних мониторах), production использует long polling: worker вызывает `getUpdates` через тот же VPN relay, offset продолжается от `max(updateId)` durable inbox, дубликаты поглощает UNIQUE. Webhook и polling взаимоисключающие; перед polling webhook удаляется. Polling проще в эксплуатации, но задерживает ответ на секунды и не масштабируется на много ботов.

Общий исходящий budget включает отчёты и служебные ответы. Начальный бесплатный лимит приложения 25 сообщений/с (оставляет запас относительно Telegram ~30); private chat не чаще 1 сообщения/с. При нескольких дедлайнах fair scheduling с приоритетом ближайшего срока, а не одновременный burst в один chat. Начальный paid operational target 900/с, максимум провайдера 1000/с, если режим и бюджет явно включены оператором.

`429`: ждать retry_after, соблюдать общий cooldown и jitter; `403` при block/deactivated прекращает рассылку этому получателю; permanent `400` — dead letter; явные transient failures — bounded exponential backoff (максимум 5 попыток). Успешный ответ сохраняет message_id. Доставка после `deadlineAt - 5 минут` отменяется как `EXPIRED`, оператор видит недоставленное; deadline capacity gate учитывает этот запас заранее.

**У Bot API sendMessage нет нашего idempotency key.** Уникальная outbox защищает от повторного планирования, но не доказывает exactly-once внешней доставки. Таймаут после отправки/краш между Telegram success и DB commit означает `DELIVERY_UNKNOWN`: автоматическая повторная отправка запрещена в базовой политике, чтобы не плодить дубли; возможна потеря сообщения, отражаемая в метриках и UI. Operator-controlled retry допускается с явным риском дубля. При известном message_id корректировка использует editMessageText, только если утверждён correction flow. Не заявлять абсолютную гарантию отсутствия дублей при сетевой неопределённости.

## Расчёт до миллиона пользователей {#capacity}

Обозначения: `U` — получатели конкретного окна, `L` — среднее число одновременно пришедшихся турниров, `P` — Telegram частей на отчёт, `M = U × L × P`. Зарегистрированных аккаунтов может быть миллион, а `U` меньше. Расчёт ограничений Telegram основан на официальных [FAQ](https://core.telegram.org/bots/faq#broadcasting-to-users) и [Bot API](https://core.telegram.org/bots/api#sendmessage), проверенных 2026-09-25; перед выпуском перепроверить.

| M сообщений | Теоретически при 30/с | Теоретически при paid 1000/с |
|---|---|---|
| 10 000 | 5 мин 33 с | 10 с |
| 100 000 | 55 мин 33 с | 1 мин 40 с |
| 1 000 000 | 9 ч 15 мин 33 с | 16 мин 40 с |
| 3 000 000 | 27 ч 46 мин 40 с | 50 мин |

Это нижние границы без retries, network overhead и per-chat ограничения. При предлагаемых 25/900 в секунду миллион занимает минимум 11 ч 6 мин 40 с / 18 мин 31 с. Практический draft SLA paid для одной кампании — 09:00–09:30 при `M ≤ 1 млн`, подтверждается тестом и запасом бюджета. Миллион получателей **ровно в 09:00** на одном боте недостижим. Если временное окно до deadline/safety cutoff меньше `M / effectiveRate`, запуск требует уменьшить cohort, расширить окно либо утвердить paid; предупреждение нельзя скрыть за очередью.

Официальный paid ceiling — до 1000 сообщений/с, тариф 0,1 Stars за платное сообщение. Консервативный budget cap на миллион — 100 000 Stars; FAQ указывает оплату сверх бесплатной квоты и условия подключения (100 000 Stars на балансе и 100 000 MAU на дату проверки). Это не покупка и не разрешение тратить: флаг `allow_paid_broadcast` по умолчанию false, обязательны per-campaign/daily spend cap, emergency stop и учёт успешных платных отправок. Конвертация Stars в рубли в оценку не включена.

Импорт: `Q = uniqueSportsProfiles × requestsPerProfile`. Для 1 млн профилей, одного запроса на профиль и окна 08:00–08:10 требуется **1667 запросов/с**, для окна до 08:50 — **333/с**. Реальный адаптер может сделать больше одного запроса. Публичный лимит Sports и разрешение такого объёма не подтверждены; текущий серверный импорт не может обещать эти сроки. Нужны согласованный bulk/feed/API, постоянная предзагрузка неизменяемых опубликованных составов и дедупликация; при строгом требовании свежего HTTP ко всем в 08:00 это отдельный внешний capacity blocker. Закрытые до дедлайна замены масштабированием не раскрыть.

Ротация кодов: нагрузка зависит от `V` одновременно открытых видимых окон настроек, а не от всей базы: `V/15` запросов/с. Для 1000 окон ≈67/с; 10 000 ≈667/с; миллион одновременных окон ≈66 667/с — уже отдельный режим нагрузочного проектирования. Хранение активных challenge O(V), короткие TTL; не писать 5,76 млрд кодов в сутки для всех пользователей.

CPU отчётов: если сборка занимает измеренные `t` мс CPU, число ядер для `M` отчётов за `W` секунд не меньше `M × t / (1000 × W × utilization)`; `t` необходимо измерить, а не предположить из числа пользователей. Общие прогнозы и расписание материализуются один раз на `(contest, round, model/config revision)`; индивидуальные scoring settings группируются по fingerprint и не теряются при объединении.

Память/диск: очередь хранит IDs/references, не миллион полных player pools. Условные 1 млн записей по 1 KiB = около 0,95 GiB payload **до** индексов, WAL, MVCC и replicas; при 30 кампаниях уже около 28,6 GiB payload. Это оценка при заданном размере, не замер PostgreSQL. Retention/партиции и фактический bytes-per-row проверяются нагрузочным прогоном. Нельзя обещать миллион пользователей на имеющихся 12 ГБ RAM по одному idle snapshot.

## Кэш, retention и наблюдаемость {#observability}

Один общий snapshot на dataset scope, shared template расписания на кампанию, пользовательские findings отдельно. Начальные process LRU ограничены 128 MiB, queue fetch 100–500, HTML 2 MiB. Новому delivery container задать memory limit 512 MiB и concurrency из измеренного latency; report worker отдельный limit после профиля памяти. Существующим production containers лимиты этим документом не меняются.

Предлагаемый retention: challenges физически удаляются не позже 1 часа после expiry; inbox 7 дней; тела/риски отчётов и подробные attempts 30 дней; компактный delivery dedup tombstone до конца сезона + 90 дней; campaign/dataset references не удалять пока существуют отчёты. `DELIVERY_UNKNOWN` не теряет tombstone при cleanup. Completed очереди чистятся небольшими батчами/партициями. Секреты, raw cookies, полный ответ Sports и персональный render не пишутся в application logs.

Метрики: campaign lag, fetch/refresh freshness и coverage, pending/oldest job, import requests/rate/429, rendered/sent/blocked/expired/unknown, dedup conflict, provider mismatch, spend Stars, PostgreSQL connection count/latency, cache hit/bytes, process RSS/heap/GC, disk/WAL/queue retention. Alerts: дедлайн конфликтует; stage не готов к 08:40; очередь математически не успевает к cutoff; 429/unknown растут; память >80% лимита; retention не работает. Web liveness не зависит от провайдера или backlog.

## Выпуск и восстановление {#recovery}

1. Перевести согласованные draft контракты в active; подготовить независимые implementation WI по этапам из [обзора](../../../docs/TELEGRAM_DEADLINE_PLAN.md#implementation).
2. Additive migrations, feature flags `TELEGRAM_LINK_ENABLED`, `TELEGRAM_DEADLINE_ENABLED`, `TELEGRAM_SEND_ENABLED`, `TELEGRAM_PAID_BROADCAST_ENABLED`; по умолчанию off. Bot token и webhook secret вне Git, webhook registration отдельным контролируемым действием.
3. Канонический immutable release: проверки → origin commit → миграционная копия/проверка → canary без scheduler → web/worker/delivery promotion. Нельзя повторно запустить все ingestion loops в delivery container.
4. Shadow mode готовит отчёты без отправки; сравнить с ручной проверкой составов и календаря. Затем opt-in pilot 10–100 → 1000 → 10 000; до следующей ступени проверить source quotas, p95 latency, память, дубли и delivery window. Миллион тестировать синтетически без миллионной рассылки реальным людям.
5. Rollback сначала выключает отправку и stops new claims, затем откатывает образ. Additive schema сохраняется. Lease/inbox/outbox переживают рестарт; неизвестные внешние доставки не повторяются автоматически. Existing UI и профили сохраняются.

## Контракты и точки входа {#contracts}

Scheduler создаёт jobs в БД; worker принимает только campaignId/jobId и читает зафиксированные версии. Операторский dry-run должен выводить состав stages, coverage и расчёт окна без fetch-массовки/отправки; отдельные явные apply/send flags включают side effects. Status endpoint возвращает stage states, timestamps, счётчики и причины деградации без персональных payload/секретов. Единственная публичная webhook точка определена в FEAT-007; сервисы обновления используют существующие adapters и их locks.

## Трассировка {#traceability}

Будущие `@spec`: `src/server/telegram/`, `src/server/deadline-reports/`, scheduler/CLI, migrations, webhook inbox/outbox и прямые contract tests. Не добавлять `@spec` draft в production-код.

## Критерии готовности {#acceptance}

- Проверены московская дата, ранние дедлайны, одинаковое время нескольких турниров, перенос/отмена, restart в каждом этапе, stale calendar и source mismatch.
- 08:10 ждёт конкретные jobs/revisions; новые XI/odds доходят до ALT; partial failures не выдаются за fresh/full.
- Конкурирующие replicas не дублируют jobs; fencing отклоняет позднего worker; million-row backlog не загружается целиком.
- Проверены webhook forgery/replay, unlink во время очереди, HTTP 429/403/400, ambiguous timeout, Telegram message limit и part dedup.
- Synthetic run на заявленный объём измеряет throughput, p95, RSS, DB connections, реальный размер очереди, cleanup и spend cap; отдельный provider gate доказывает допустимый объём Sports.
- Перед и после пилота проверены память, cache bytes, дубли source jobs/сообщений, retention, отсутствие лишних worker loops; ни health=200, ни один successful fetch не являются capacity evidence.

## Связи {#relationships}

`spec://modules/telegram/FEAT-007-deadline-assistant#squad-source` определяет допустимые источники состава; `spec://modules/machete/INFRA-004-sorareinside-starters#apply` сохраняет атомарность XI; `spec://modules/machete/FEAT-006-sports-popularity#errors` задаёт bounded сбор и retention рейтингов.

## REVIEW и история {#changelog}

- 2026-10-10: WI-070 — delivery retains its five-second tick; campaign planning reacts to subscription/calendar fingerprint changes, manual requests and a five-minute safety refresh. Unchanged terminal campaigns and identical stage due times perform no writes. Actual schedule/date changes update the campaign and invalidate old queued/failed input versions; existing delivery/build ownership and deduplication remain.

- REVIEW: источник настоящего deadline для каждой лиги — кампания не планируется при `DEADLINE_CONFLICT`, неизвестном календаре или дедлайне раньше 09:00 МСК; такие туры видны оператору и не рассылаются.
- REVIEW: канал приватных последних замен не реализован; доступен только опубликованный состав.
- REVIEW: договорённость по массовому Sports API отсутствует; первый выпуск рассчитан на малую аудиторию и bounded import.
- REVIEW: SLA/paid бюджет не приняты; свободная очередь 25/с, `TELEGRAM_PAID_BROADCAST_ENABLED=false`.
- 2026-09-25: создан draft на основании живого read-only обследования production и официальных лимитов Telegram.
- 2026-09-25: переведён в `active` для реализации WI-033. Сознательные компромиссы первого выпуска: доставка выполняется ограниченным тиком в существующем worker-процессе (не отдельный контейнер), отдельный материализатор отчётов по fingerprint формулы не построен, synthetic million load не проводился. Это зафиксировано в TECHDEBT и не отменяет канон.
- 2026-09-25: WI-034 закрепил transport-контур: Bot API через общий VPN relay, регистрация webhook отдельным admin-действием, флаги и секреты из operator env.
- 2026-09-25: WI-036 переключил production на long polling через VPN relay (`getUpdates`, offset из durable inbox), потому что входящие соединения Telegram до хоста недоступны; webhook удалён и остаётся альтернативой.
