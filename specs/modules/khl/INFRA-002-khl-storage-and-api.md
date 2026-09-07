---
status: draft
---

# INFRA-002: хоккейные данные, API и миграции {#root}

## Архитектурное решение {#boundary}

Первый релиз использует отдельные модели `Khl*` с таблицами `khl_*` и строковыми внутренними ID. Общие User/сессии/франшизы/Prisma/инфраструктура остаются. Не вставлять mobile ID или Sports.ru ID в футбольные CorePlayer/CoreTeam/CoreMatch и не назначать отрицательные ID как namespace.

Причина: `FantasyContest`, `FantasyPlayerPrice`, `UserFantasySquadPlayer`, `FantasyModelForecast` и `FixtureOddsSnapshot` имеют FK в футбольное ядро; добавление только sport в JSON не изолирует данные. Общая платформа сущностей возможна отдельной последующей миграцией, не обязательна для КХЛ. Дублируется доменная модель, но не HTTP/auth/кэш-код.

## Схема (проект, Prisma ещё не изменён) {#schema}

Все даты UTC DateTime, внутренние ID string; цены integer units, FP и xG Decimal с точностью не ниже 4 знаков, вероятности в [0,1]. Значения округлять для отображения, не в промежуточных расчётах. Во всех изменяемых наборах updatedAt и revision. В API IDs — строки, даты — ISO 8601, Decimal — конечные JSON numbers в документированных единицах; исходная точность остаётся в БД.

| Модель / ключи | Основные поля и связи |
|---|---|
| KhlCompetition, KhlSeason | Competition code=KHL; season label, startsAt/endsAt, regular/playoff; UNIQUE(competitionId, seasonKey); текущий сезон не определяется годом сервера |
| KhlTeam, KhlPlayer, KhlRosterMembership | Имена, дата рождения nullable, G/D/F, team/player/season FK, validFrom/validTo; историческая принадлежность не перезаписывается текущей |
| KhlExternalEntityMap | UNIQUE(provider, entityType, providerScope, externalId); ровно один FK из season/team/player/match/contest/week; CHECK соответствия entityType, mappingStatus/reason/version. Разные пространства season mobile/khl/sports различаются |
| KhlContest | seasonId FK, provider=SPORTS_RU, providerContestId, rulesetId, priceUnit=SPORTS_POINTS; UNIQUE(provider, providerContestId, seasonId); 107 не глобальный сезонный ID |
| KhlRuleset | contestId, version, sourceUrl/hash, verifiedAt, rules JSON с валидируемой схемой, scoringBoundaryStatus; UNIQUE(contestId,version) |
| KhlFantasyWeek | contestId, providerWeekId, startsAt/endsAt nullable, timezone, verificationStatus; UNIQUE(contestId,providerWeekId); подтверждённые интервалы без пересечений |
| KhlMatch, KhlMatchFantasyWeek | seasonId, home/away FK, startsAt, status, regulationScore, otScore, shootoutScore, finalScore, decidedBy=REGULATION/OT/SO/UNKNOWN; UNIQUE(contestId,matchId) для явного назначения недели |
| KhlPlayerMatchStat | UNIQUE(matchId,playerId); clubAtMatchId, participationStatus, toiSeconds, ppToiSeconds, pkToiSeconds, shifts, goals, assists, plusMinus, pimMinutes, shotsOnGoal, blockedShots; goalie saves/goalsAgainst/started/fullGame/emptyNet metadata nullable. Источники по группам полей, не один source для всей строки |
| KhlFieldObservation | entityType/entityId/field, value JSON, quality=FACT/ESTIMATE/UNKNOWN, provider, sourceUrl, observedAt, fetchedAt, revision/hash; UNIQUE(provider,entityType,entityId,field,sourceRevision). Winner observation ссылается из нормализованного набора; противоречащие факты не теряются |
| KhlXgObservation | matchId, subjectType=PLAYER/TEAM, ровно один subject FK, provider, metric=IXG/XG_FOR/XG_AGAINST/GSAx, strength=ALL/EV/PP/PK/UNKNOWN, definitionVersion/modelVersion nullable, revision, value, availableAt/fetchedAt. UNIQUE(provider,matchId,subjectType,subjectId,metric,strength,revision) |
| KhlFantasyPlayer, KhlPriceRevision | UNIQUE(contestId,providerPlayerId), playerId nullable до mapping, fantasyClubId, position, currentPriceUnits, delta, ownershipPct; revisions UNIQUE(fantasyPlayerId,revisionSequence), UNIQUE(fantasyPlayerId,transitionKey), contentHash, effectiveAt nullable, observedAt/lastSeenAt. UNIQUE(contestId,playerId) для ненулевого playerId предотвращает двойное сопоставление |
| KhlAvailabilityObservation | player/season/match nullable, injury/suspension/PP role/goalie starter, fact/estimate/unknown, confidence nullable, source/expiresAt; официальный transfer lock хранится для fantasyPlayer/contest, не смешивается с травмой |
| KhlOfficialFantasyScore | contestId, fantasyPlayerId, matchId nullable до mapping, providerMatchKey, providerWeekId, revision, points, fetchedAt; UNIQUE(contestId,fantasyPlayerId,providerMatchKey,revision); current pointer. Расчётный breakdown — отдельное поле/модель с rulesVersion |
| KhlUserSquad, KhlUserSquadEntry | userId FK, contestId, name, kind=LOCAL_DRAFT/PROVIDER_OBSERVED, revision, bankUnits nullable, baselineSnapshotId; UNIQUE(userId,contestId,name). Entry: UNIQUE(squadId,fantasyPlayerId), UNIQUE(squadId,slotIndex), keepForOptimizer, acquiredPriceUnits nullable; нет starter/captain/bench |
| KhlProviderSquadSnapshot, KhlUserWeekState | userId/contestId/providerTeamId, fetchedAt/hash, revisionSequence, transitionKey, official entries, bankUnits, transfersUsed nullable, asOf; UNIQUE(userId,contestId,providerTeamId,transitionKey). WeekState UNIQUE(userId,contestId,providerTeamId,weekId), sourceSnapshotId, verifiedAt |
| KhlTransferScenario, KhlTransferStep | squadId/version, baselineHash, weekId, effectiveAt, out/in IDs, quotedPriceRevisionIds, status=PLANNED/LOCALLY_APPLIED/SUPERSEDED, idempotencyKey/requestHash; UNIQUE(userId,idempotencyKey). Внешняя операция не возникает от локального сохранения |
| KhlObservedTransfer | providerTeamId/contestId, providerOperationId или надёжный provider fingerprint, occurredAt, weekId, out/in, sourceSnapshotId. Нельзя вывести полный журнал из одной разницы составов; неизвестные обмены помечены incomplete |
| KhlForecastRevision, KhlPlayerMatchForecast | contest/season/week/horizon, rules/model/input versions, status, coverage; UNIQUE(forecastRevisionId,playerId,matchId), EP/components, appearance/start probabilities, TOI/PP expectations, quality. Публикация только целого набора |
| KhlOddsEventMap, KhlOddsSnapshot, KhlOddsMarket | UNIQUE(provider,providerEventId); matchId FK и matching status; snapshot UNIQUE(provider,eventId,revisionSequence), UNIQUE(provider,eventId,transitionKey), normalizedHash, observedAt/lastSeenAt/completeFeed; market UNIQUE(snapshotId,marketType,settlementScope,period,selection,lineKey), odds/status/probability/market dictionary version |
| KhlSyncJob, KhlSyncCheckpoint, KhlRawPayload | provider/scope/jobType, leaseUntil, attempts, nextRunAt, cursor, sourceHash, bounded error; один pending/running по логическому scope через partial UNIQUE; Raw UNIQUE(provider,scope,contentHash), expiresAt, parserVersion |
| KhlUserViewPreference | UNIQUE(userId,contestId,viewKey); columns/widths/filters/compare IDs with schemaVersion. Не перезаписывает User.squadTableColumns футбола |

Истории цен, статусов, составов и коэффициентов сравнивают hash с последней ревизией, а не со всей историей. A→A обновляет lastSeenAt; A→B→A создаёт три последовательные ревизии. transitionKey стабилен для повтора одной операции импорта и отличается у следующего наблюдаемого перехода. RevisionSequence назначается атомарно под блокировкой current pointer. Raw bytes можно дедуплицировать глобально по hash; историю переходов — нельзя. Для полей без sourceRevision использовать стабильный transitionKey адаптера.

Индексы: match(seasonId,startsAt,status); stats(playerId,matchId); price(fantasyPlayerId,observedAt); observation(entityId,field,observedAt); odds(matchId,observedAt); job(status,nextRunAt); squads(userId,contestId,updatedAt). Сезон/турнир состава, игрока, недели и матча проверяется FK где возможно и транзакционным валидатором. Удаление матча не каскадирует пользовательские сценарии/историю: restrict или soft-delete. Смена источника не удаляет official FP.

## API v1 {#api}

Новые маршруты под `/api/machete/khl`, отдельные от футбольного `/api/machete/squads`. Только текущий авторизованный пользователь и существующая проверка франшизы. Общие read DTO: `apiVersion:1`, `scope:{sport:"ICE_HOCKEY",contestId,seasonId}`, `asOf`, `dataRevision`, `readiness:{status,reasons,coverage}`, `sources`, `data`. Источник/давность каждого важного поля доступны в detail DTO.

| Метод и путь | Вход | Выход |
|---|---|---|
| GET `/contests` | Нет | Доступные contest/season/rules version, доступные функции |
| GET `/weeks?contestId=...` | Обязательный contest | Provider weeks с границами, статусом проверки и числом игр |
| GET `/calendar?contestId=...&weekId=...` | Одна неделя или диапазон до 42 суток | Матчи, соперники, статусы, settlement, индивидуальные сроки lock |
| GET `/players?contestId=...&weekId=...&position=G&cursor=...&limit=50` | G/D/F, клуб, цена, доступность, TOI/PP, forecast quality, сортировка | Пагинация, count, nextCursor, poolRevision; лимит ≤100, стабильная сортировка с ID tie-break |
| GET `/players/{id}?contestId=...&historyWindow=10` | Scoped ID, окно 5/10/20 матчей или сезон | История FP/статистики/цен, xG definitions, источники, прогноз по матчам |
| POST `/compare` | contest/week, 2–4 player IDs, одинаковые фильтры истории | Сопоставимые метрики и null-aware deltas |
| GET `/squads?contestId=...` и `/squads/{id}` | Scoped query | Только доступные пользователю варианты, bank и версия baseline |
| POST `/squads` | contestId, name, entries[], bankUnits nullable | Созданный локальный draft, revision, violations; частичный draft разрешён, статус incomplete |
| PUT `/squads/{id}` | expectedVersion, entries, bankUnits, mode=DRAFT/COMPLETE | Атомарное сохранение; COMPLETE требует 17/2/6/9, бюджет и клубный лимит |
| POST `/squads/{id}/import-sports-ru` | providerTeamId (не произвольный URL), expectedVersion, Idempotency-Key | Импорт наблюдаемого read-only baseline либо IMPORT_UNAVAILABLE с точной причиной |
| POST `/squads/{id}/transfer-preview` | baselineHash, expectedVersion, weekId, effectiveAt, steps[] | Финальный состав, cash/EP delta, remainingGames/transferCount/locks, quote hash/revisions/expiresAt |
| POST `/squads/{id}/transfer-plans` | quote hash, expectedVersion, Idempotency-Key | Сохраняет локальный сценарий и новую версию; `externalExecuted:false` |
| POST `/optimize` | scope, poolRevision, forecastRevision, squadVersion, horizon ≤4 weeks, keep/exclude IDs, maxTransfers | requestId, status, proposal, violations, optimality/time-limit marker; один active solve на пользователя |
| GET `/readiness?contestId=...` | Contest | Каталог/статистика/xG/Фонбет/недели/внешний профиль: отдельные статусы |
| PUT `/preferences` | contestId, viewKey, schemaVersion, preferences | Только настройки КХЛ текущего пользователя |

Серверный solve использует тот же чистый domain contract, что worker; UI может считать локально для скорости, но сервер независимо валидирует любой сохраняемый результат. POST не получает доверенный EP/price/lock от клиента.

Общий body limit 256 KiB; max 17 entries, 17 keep IDs, 100 exclude IDs, 5 transfer steps после начала недели, max 4 сравниваемых игрока. До начала турнира сценарий может заменить весь состав, но body всё равно ограничен. Настраиваемый rate limit solve: 10 запусков/мин/пользователь, timeout 5 с; import: 2/мин. Внешний запрос только через allowlisted provider adapter, не user URL; request timeout, redirects и response size проверяются. Cookie mutations сохраняют защиту same-origin/CSRF проекта. Логи без сессий/паролей и полных личных составов.

Коды: 400 INVALID_INPUT; 401 UNAUTHENTICATED; 403 FORBIDDEN; 404 NOT_FOUND (включая чужую сущность/выключенный модуль); 409 VERSION_CONFLICT, PRICE_CHANGED, LOCK_CHANGED, WEEK_CHANGED, BASELINE_STALE; 422 INVALID_ROSTER, BUDGET_EXCEEDED, CLUB_LIMIT, TRANSFER_LIMIT, UNKNOWN_TRANSFER_BALANCE, INCOMPLETE_DATA; 429 RATE_LIMITED; 503 SOURCE_UNAVAILABLE/IMPORT_UNAVAILABLE. Readiness-degraded GET может вернуть 200 с last-good data; отсутствие обязательных данных не маскируется пустым «успешным» подбором.

## Транзакции и мгновенное действие {#transactions}

`keepForOptimizer` — предпочтение пользователя. `providerTransferLock` — запрет внешней площадки; это два разных поля и два разных значка. Перед preview и сохранением сценария:

1. Проверить owner/franchise, sport/contest/season/week, squadVersion и baselineHash; загрузить согласованные price/status/schedule revisions. Во время сетевого refresh SQL-транзакция не удерживается.
2. Подтвердить свежесть, передаваемые out действительно принадлежат составу, in отсутствуют, соблюдены positions/club/cash на каждом исполняемом шаге. Одновременный pair exchange считается одним трансфером; несколько шагов проверяются последовательно по времени.
3. Проверить locks обеих сторон и `effectiveAt`; сохранить предупреждение о потерянных оставшихся матчах продаваемого игрока. Будущая разблокировка/цена не гарантируется, такой шаг — условный план.
4. В короткой транзакции optimistic CAS/serializable проверить версии повторно, записать локальный scenario + entries + revision + evidence. При конфликте откатить целиком, предложить свежий preview. Одинаковый Idempotency-Key с тем же hash возвращает тот же результат, с иным payload — 409.
5. Сохранение draft/scenario не расходует официальный weekly transfer balance. Внешний подтверждённый snapshot/journal обновляет observed state отдельно; неизвестный остаток запрещает заявления «доступно 5». Локальные плановые операции учитываются только внутри плана относительно baseline.

Внешний импорт состава — отдельный источник, стабильный hockey team endpoint и полнота истории ещё не подтверждены. При недоступности разрешён ручной локальный draft с явной отметкой «состояние Sports.ru не подтверждено». В будущем пользователь самостоятельно выполняет операции на Sports.ru; новый read-only sync фиксирует факт, не объявляет внешнее выполнение по нажатию нашей кнопки.

## Миграции и откат {#migrations}

1. На актуальной ветке проверить schema/migrations и назначить следующую свободную версию. Не выполнять миграцию в задаче на спецификации.
2. Аддитивно создать Khl* таблицы/FK/indexes, не менять типы ID и defaults футбола. Единственная общая FK — к User и необходимой модели доступа; KHL-specific настройки отдельно.
3. Seed только проверенных competition/season/provider mapping/rules version за выключенным флагом, импорт idempotent. Не создавать пользовательские составы и не запускать production backfill как post-migrate hook.
4. Ограниченный staging backfill текущего сезона + источники предыдущего сезона для backtest; не копировать футбольные исторические строки в КХЛ.
5. До/после сравнить counts и hashes/агрегаты футбол-сущностей и пользовательских записей на том же snapshot, провести smoke Sports.ru/FPL. Индексы и блокировки проверить на staging-копии.
6. Feature flag off останавливает маршруты и новые jobs, graceful stop освобождает leases. Откат приложения оставляет additive таблицы, чтобы не потерять пользовательские данные. DROP КХЛ после использования — отдельная операция с backup, не штатный rollback.

## Приёмка {#acceptance}

- DB-01: один внешний ID может встречаться у разных provider/entity/scope без коллизии; mapping не допускает два хоккеиста на один fantasyPlayer.
- DB-02: reimport неизменного snapshot не растит историю; correction создаёт revision; null не заменён нулём.
- API-01: чужой squad/contest mismatch, произвольный URL, >body limit, неверная роль, выключенный flag отклонены сервером.
- API-02: два параллельных сохранения одной версии — одно успешно, второе 409; повтор idempotent не удваивает шаги.
- API-03: изменения price/lock/week после preview не позволяют сохранить устаревший сценарий как подтверждённый; draft отдельно от official state.
- MIG-01: миграции с чистой и существующей БД, drift check, откат приложения и отсутствие изменений футбольных данных проверены.

## Связи {#relationships}

`spec://modules/khl/FEAT-001-khl-module-and-rules#rules`, `spec://modules/khl/FEAT-002-khl-squad#transfers`, `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`.

## История {#changelog}

- 2026-09-07: предложены изолированная схема и API; SQL/Prisma/routes не созданы.
