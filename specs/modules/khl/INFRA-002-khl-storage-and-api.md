---
status: active
---

<a name="root"></a>

# INFRA-002: hockey data, API and migrations {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Hockey entities and APIs are isolated. Saves validate ownership and version.

<a name="goal"></a>

## Goal {#goal}

Do not damage football data during the development and release of the KHL.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. Canon is active upon user request; source/rules gates determine the availability of relevant features, not the status of the document.


<a name="boundary"></a>

## Architectural solution {#boundary}

The first release uses separate models `Khl*` with tables `khl_*` and string internal IDs. Common User/sessions/franchises/Prisma/infrastructure remain. Do not insert mobile ID or Sports.ru ID into football CorePlayer/CoreTeam/CoreMatch and do not assign negative IDs as namespace.

Reason: `FantasyContest`, `FantasyPlayerPrice`, `UserFantasySquadPlayer`, `FantasyModelForecast` and `FixtureOddsSnapshot` have FK in the football core; adding just sport to the JSON does not isolate the data. The common entity platform is possible as a separate subsequent migration, but is not required for the KHL. The domain model is duplicated, but not the HTTP/auth/cache code.

<a name="schema"></a>

## Schema and data contracts {#schema}

Archive aggregate JSON may contain separate `protocolStats`: official season and player ID, source URL, unique match IDs, exact amounts/coverage. These fields are saved when you re-import Sports. Official FP and remaining Sports Points will not be overwritten. Importing protocols replaces the entire snapshot by hash and does not add it again; incomplete replacement with loss of previously known matches is rejected. Reading and forecast distinguish between the volume of Sports history and KHL coverage; They don’t mix the regular season with the playoffs.

KhlHistoricalSeason stores one normalized snapshot of history on canonical player + seasonKey, without linking past clubs to the current roster. Fields: providerSeasonId, source, contentHash, observedAt/availableAt, aggregate JSON with totals/knownGames, played/DNP, average official FP and the balance of other points. A unique key eliminates duplicates; At most two previous seasons are retained per player. Raw HTML is not saved to the database. Read-model returns only the last season of the current tournament, available on asOf; current match amounts remain unchanged. Migration is additive.

All dates UTC DateTime, internal ID string; prices integer units, FP and xG Decimal with an accuracy of at least 4 digits, probability in [0,1]. Values ​​should be rounded for display purposes, not in intermediate calculations. In all mutable sets updatedAt and revision. In API IDs - strings, dates - ISO 8601, Decimal - final JSON numbers in documented units; the original accuracy remains in the database.

| Model / keys | Main fields and connections |
|---|---|
| KhlCompetition, KhlSeason | Competition code=KHL; season label, startsAt/endsAt, regular/playoff; UNIQUE(competitionId, seasonKey); the current season is not determined by the server year |
| KhlTeam, KhlPlayer, KhlRosterMembership | Names, date of birth nullable, G/D/F, team/player/season FK, validFrom/validTo; historical ownership is not overwritten by the current one |
| KhlExternalEntityMap | UNIQUE(provider, entityType, providerScope, externalId); exactly one FK from season/team/player/match/contest/week; CHECK matching entityType, mappingStatus/reason/version. Different spaces season mobile/khl/sports vary |
| KhlContest | seasonId FK, provider=SPORTS_RU, providerContestId, rulesetId, priceUnit=SPORTS_POINTS; UNIQUE(provider, providerContestId, seasonId); 107 non-global seasonal ID |
| KhlRuleset | contestId, version, sourceUrl/hash, verifiedAt, rules JSON with validated schema, scoringBoundaryStatus; UNIQUE(contestId,version) |
| KhlFantasyWeek | contestId, providerWeekId, startsAt/endsAt nullable, timezone, verificationStatus; UNIQUE(contestId,providerWeekId); confirmed intervals without intersections |
| KhlMatch, KhlMatchFantasyWeek | seasonId, home/away FK, startsAt, status, regulationScore, otScore, shootoutScore, finalScore, decidedBy=REGULATION/OT/SO/UNKNOWN; UNIQUE(contestId,matchId) for explicit week assignment |
| KhlPlayerMatchStat | UNIQUE(matchId,playerId); clubAtMatchId, participationStatus, toiSeconds, ppToiSeconds, pkToiSeconds, shifts, goals, assists, plusMinus, pimMinutes, shotsOnGoal, blockedShots; goalie saves/goalsAgainst/started/fullGame/emptyNet metadata nullable. Sources by field groups, not one source for the entire row |
| KhlFieldObservation | entityType/entityId/field, value JSON, quality=FACT/ESTIMATE/UNKNOWN, provider, sourceUrl, observedAt, fetchedAt, revision/hash; UNIQUE(provider,entityType,entityId,field,sourceRevision). Winner observation refers from a normalized set; contradictory facts are not lost |
| KhlXgObservation | matchId, subjectType=PLAYER/TEAM, exactly one subject FK, provider, metric=IXG/XG_FOR/XG_AGAINST/GSAx, strength=ALL/EV/PP/PK/UNKNOWN, definitionVersion/modelVersion nullable, revision, value, availableAt/fetchedAt. UNIQUE(provider,matchId,subjectType,subjectId,metric,strength,revision) |
| KhlFantasyPlayer, KhlPriceRevision | UNIQUE(contestId,providerPlayerId), playerId nullable before mapping, fantasyClubId, position, currentPriceUnits, delta, ownershipPct; revisions UNIQUE(fantasyPlayerId,revisionSequence), UNIQUE(fantasyPlayerId,transitionKey), contentHash, effectiveAt nullable, observedAt/lastSeenAt. UNIQUE(contestId,playerId) for non-null playerId prevents double matching |
| KhlAvailabilityObservation | player/season/match nullable, injury/suspension/PP role/goalie starter, fact/estimate/unknown, confidence nullable, source/expiresAt; official transfer lock is kept for fantasyPlayer/contest, not mixed with injury |
| KhlOfficialFantasyScore | contestId, fantasyPlayerId, matchId nullable to mapping, providerMatchKey, providerWeekId, revision, points, fetchedAt; UNIQUE(contestId,fantasyPlayerId,providerMatchKey,revision); current pointer. Calculated breakdown - separate field/model with rulesVersion |
| KhlUserSquad, KhlUserSquadEntry | userId FK, contestId, name, kind=LOCAL_DRAFT/PROVIDER_OBSERVED, revision, bankUnits nullable, baselineSnapshotId; UNIQUE(userId,contestId,name). Entry: UNIQUE(squadId,fantasyPlayerId), UNIQUE(squadId,slotIndex), keepForOptimizer, acquiredPriceUnits nullable; no starter/captain/bench |
| KhlProviderSquadSnapshot, KhlUserWeekState | userId/contestId/providerTeamId, fetchedAt/hash, revisionSequence, transitionKey, official entries, bankUnits, transfersUsed nullable, asOf; UNIQUE(userId,contestId,providerTeamId,transitionKey). WeekState UNIQUE(userId,contestId,providerTeamId,weekId), sourceSnapshotId, verifiedAt |
| KhlTransferScenario, KhlTransferStep | squadId/version, baselineHash, weekId, effectiveAt, out/in IDs, quotedPriceRevisionIds, status=PLANNED/LOCALLY_APPLIED/SUPERSEDED, idempotencyKey/requestHash; UNIQUE(userId,idempotencyKey). External operation does not arise from local saving |
| KhlObservedTransfer | providerTeamId/contestId, providerOperationId or reliable provider fingerprint, occurredAt, weekId, out/in, sourceSnapshotId. It is not possible to derive a complete log from the squad difference alone; unknown exchanges are marked incomplete |
| KhlForecastRevision, KhlPlayerMatchForecast | contest/season/week/horizon, rules/model/input versions, status, coverage; UNIQUE(forecastRevisionId,playerId,matchId), EP/components, appearance/start probabilities, TOI/PP expectations, quality. Publishing only the whole set |
| KhlOddsEventMap, KhlOddsSnapshot, KhlOddsMarket | UNIQUE(provider,providerEventId); matchId FK and matching status; snapshot UNIQUE(provider,eventId,revisionSequence), UNIQUE(provider,eventId,transitionKey), normalizedHash, observedAt/lastSeenAt/completeFeed; market UNIQUE(snapshotId,marketType,settlementScope,period,selection,lineKey), odds/status/probability/market dictionary version |
| KhlSyncJob, KhlSyncCheckpoint, KhlRawPayload | provider/scope/jobType, leaseUntil, attempts, nextRunAt, cursor, sourceHash, bounded error; one pending/running by logical scope via partial UNIQUE; Raw UNIQUE(provider,scope,contentHash), expiresAt, parserVersion |
| KhlUserViewPreference | UNIQUE(userId,contestId,viewKey); columns/widths/filters/compare IDs with schemaVersion. Doesn't overwrite User.squadTableColumns football |

Histories of prices, statuses, squads and odds compare the hash with the latest revision, and not with the entire history. A→A updates lastSeenAt; A→B→A creates three consecutive revisions. transitionKey is stable for repeating one import operation and different for the next observed transition. RevisionSequence is assigned atomically under the current pointer lock. Raw bytes can be deduplicated globally by hash; transition history is not possible. For fields without sourceRevision, use a stable transitionKey adapter.

Indexes: match(seasonId,startsAt,status); stats(playerId,matchId); price(fantasyPlayerId,observedAt); observation(entityId,field,observedAt); odds(matchId,observedAt); job(status,nextRunAt); squads(userId,contestId,updatedAt). Season/tournament squad, player, week and match are verified by FK where possible and by a transactional validator. Deleting a match does not cascade user scripts/history: restrict or soft-delete. Changing the source does not delete the official FP.

<a name="api"></a>

## API v1 {#api}

New routes under `/api/machete/khl`, separate from the football `/api/machete/squads`. Current authorized user and existing franchise verification only. Common read DTOs: `apiVersion:1`, `scope:{sport:"ICE_HOCKEY",contestId,seasonId}`, `asOf`, `dataRevision`, `readiness:{status,reasons,coverage}`, `sources`, `data`. The source/date of each important field is available in the detail DTO.

| Method and path | Input | Output |
|---|---|---|
| GET `/contests` | No | Available contest/season/rules version, available functions |
| GET `/weeks?contestId=...` | Mandatory contest | Provider weeks with boundaries, verification status and number of games |
| GET `/calendar?contestId=...&weekId=...` | One week or a range of up to 42 days | Matches, opponents, statuses, settlement, individual deadlines lock |
| GET `/players?contestId=...&weekId=...&position=G&cursor=...&limit=50` | G/D/F, club, price, availability, TOI/PP, forecast quality, sorting | Pagination, count, nextCursor, poolRevision; limit ≤100, stable sorting with ID tie-break |
| GET `/players/{id}?contestId=...&historyWindow=10` | Scoped ID, match window 5/10/20 or season | FP/stats/price history, xG definitions, sources, match forecast |
| POST `/compare` | contest/week, 2–4 player IDs, same history filters | Comparable metrics and null-aware deltas |
| GET `/squads?contestId=...` and `/squads/{id}` | Scoped query | Only user-available options, bank and baseline version |
| POST `/squads` | contestId, name, entries[], bankUnits nullable | Created local draft, revision, violations; partial draft allowed, status incomplete |
| PUT `/squads/{id}` | expectedVersion, entries, bankUnits, mode=DRAFT/COMPLETE | Atomic save; COMPLETE requires 17/2/6/9, budget and club limit |
| POST `/squads/import-sports-ru` | contestId, squadId/expectedVersion optional | Current team of the linked Sports profile, atomic new/existing option; the snapshot is deduplicated according to the contents of |
| POST `/squads/{id}/import-sports-ru` | expectedVersion | Applying a previously confirmed fresh image |
| POST `/squads/{id}/transfer-preview` | baselineHash, expectedVersion, weekId, effectiveAt, steps[] | Final lineup, cash/EP delta, remainingGames/transferCount/locks, quote hash/revisions/expiresAt |
| POST `/squads/{id}/transfer-plans` | quote hash, expectedVersion, Idempotency-Key | Saves the local script and the new version; `externalExecuted:false` |
| POST `/optimize` | scope, poolRevision, forecastRevision, squadVersion, horizon ≤4 weeks, keep/exclude IDs, maxTransfers | requestId, status, proposal, violations, optimality/time-limit marker; one active solve per user |
| GET `/readiness?contestId=...` | Contest | Catalog/statistics/xG/Fonbet/weeks/external profile: individual statuses |
| PUT `/preferences` | contestId, viewKey, schemaVersion, preferences | Only KHL settings of the current user |

Server solve uses the same pure domain contract as worker; The UI may read locally for speed, but the server independently validates any result it stores. POST does not receive a trusted EP/price/lock from the client.

General body limit 256 KiB; max 17 entries, 17 keep IDs, 100 exclude IDs, 5 transfer steps after the start of the week, max 4 compared players. Before the tournament starts, the script can replace the entire roster, but the body is still limited. Configurable rate limit solve: 10 starts/min/user, timeout 5 s; import: 2/min. External request only via allowlisted provider adapter, not user URL; request timeout, redirects and response size are checked. Cookie mutations preserve the project's same-origin/CSRF protection. Logs without sessions/passwords and complete personal information.

Codes: 400 INVALID_INPUT; 401 UNAUTHENTICATED; 403 FORBIDDEN; 404 NOT_FOUND (including foreign entity/disabled module); 409 VERSION_CONFLICT, PRICE_CHANGED, LOCK_CHANGED, WEEK_CHANGED, BASELINE_STALE; 422 INVALID_ROSTER, BUDGET_EXCEEDED, CLUB_LIMIT, TRANSFER_LIMIT, UNKNOWN_TRANSFER_BALANCE, INCOMPLETE_DATA; 429 RATE_LIMITED; 503 SOURCE_UNAVAILABLE/IMPORT_UNAVAILABLE. Readiness-degraded GET may return 200 with last-good data; the absence of required data is not masked by an empty “successful” selection.

<a name="transactions"></a>

## Transactions and instant action {#transactions}

`keepForOptimizer` - user preference. `providerTransferLock` - prohibition of external site; these are two different fields and two different icons. Before previewing and saving the script:

1. Check owner/franchise, sport/contest/season/week, squadVersion and baselineHash; download agreed price/status/schedule revisions. During a network refresh, the SQL transaction is not held.
2. Confirm freshness, transmitted outs really belong to the squad, ins are missing, positions/club/cash are observed at each executable step. Simultaneous pair exchange is considered one transfer; several steps are checked sequentially in time.
3. Check locks of both sides and `effectiveAt`; keep a warning about the lost remaining matches of the player being sold. Future unlock/price is not guaranteed, this step is a tentative plan.
4. In a short transaction optimistic CAS/serializable, check the versions again, write down the local scenario + entries + revision + evidence. If there is a conflict, roll back the whole thing and offer a fresh preview. The same Idempotency-Key with the same hash returns the same result, with a different payload - 409.
5. Saving draft/scenario does not consume the official weekly transfer balance. External confirmed snapshot/journal updates observed state separately; unknown remainder prohibits "5 available" statements. Local scheduled operations are taken into account only within the plan relative to the baseline.

External import of squad - separate source: public profile → HTML commands → GET `/fantasy/hockey/team/json/{teamId}.json`. Current 17 players and bank are checked by owner/contest/provider IDs; The HTML cost is checked against the sum of the response prices. This is a current snapshot, the completeness of the history and the official balance of transfers have not been confirmed. A week with no obvious source is recorded as unknown rather than guessed. The network is limited by allowlist, timeout, size and 2 imports/min/user; queries do not hold SQL transaction. The snapshot does not contain raw HTML, the hash excludes fetchedAt, and no more than 3 of unlinked user/tournament snapshots plus used variants are saved. If unavailable, a manual local draft is allowed with an explicit mark “Sports.ru status is not confirmed.” In the future, the user independently performs operations on Sports.ru; The new read-only sync records the fact and does not declare external execution when our button is pressed.

<a name="migrations"></a>

## Migrations and rollbacks {#migrations}

1. On the current branch, check schema/migrations and assign the next free version. Do not perform migration in a specification task.
2. Additively create Khl* tables/FK/indexes, do not change football ID types and defaults. The only common FK is to User and the required access model; KHL-specific settings separately.
3. Seed only verified competition/season/provider mapping/rules version with the flag turned off, idempotent import. Do not create custom squads and do not run production backfill as a post-migrate hook.
4. Limited staging backfill of the current season + sources of the previous season for backtest; do not copy football historical lines in the KHL.
5. Before/after compare counts and hashes/aggregates of football entities and user records on the same snapshot, run smoke Sports.ru/FPL. Check indexes and locks on staging copies.
6. Feature flag off stops routes and new jobs, graceful stop releases leases. Rolling back the application leaves the additive tables so as not to lose user data. DROP KHL after use is a separate operation with backup, not a standard rollback.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- DB-01: one external ID can be found in different providers/entity/scope without a collision; mapping does not allow two hockey players per fantasyPlayer.
- DB-02: reimport of an unchanged snapshot does not grow history; correction creates revision; null is not replaced by zero.
- API-01: foreign squad/contest mismatch, arbitrary URL, >body limit, incorrect role, disabled flag are rejected by the server.
- API-02: two parallel saves of the same version - one successful, the second 409; idempotent repeat does not double steps.
- API-03: changes in price/lock/week after preview do not allow saving an outdated script as confirmed; draft is separate from the official state.
- MIG-01: migrations from a clean and existing database, drift check, application rollback and no changes to football data are checked.

<a name="relationships"></a>

## Related specifications {#relationships}

`spec://modules/khl/FEAT-001-khl-module-and-rules#rules`, `spec://modules/khl/FEAT-002-khl-squad#transfers`, `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- 2026-09-07: during integration, the original anchors and requirements are preserved; added mandatory sections of the current standalone protocol and implementation trace. Draft gates have not been removed.

- 2026-09-07: isolated scheme and API proposed; SQL/Prisma/routes were not created.

<a name="scope"></a>

## Scope {#scope}

Khl* storage, HTTP API and migrations; football PK/FK and rules do not change (#boundary).

<a name="environments"></a>

## Environments and dependencies {#environments}

Separate local database for checking; production is released from a clean Git commit after backup/rehearsal (#migrations).

<a name="decisions"></a>

## Canonical decisions {#decisions}

Additive tables khl_* and string internal IDs; shared User contains feedback links (#boundary).

<a name="runtime"></a>

## Runtime and operations {#runtime}

Next API and Prisma transactions; flags are disabled by default; imports are run explicitly.

<a name="data"></a>

## Data and state {#data}

Models and unique keys are listed in #schema; null is different from zero.

<a name="contracts"></a>

## Contracts {#contracts}

Auth, ownership, no-store, payload restrictions, CAS and idempotency are defined in #api/#transactions.

<a name="recovery"></a>

## Rollout, rollback, and recovery {#recovery}

Before backup and rehearsal migrations; old football tables are not deleted. Rollback rules in #migrations.

<a name="observability"></a>

## Observability {#observability}

Checks migration state, duplicates, API conflicts, freshness and storage limitations; reasons for failures are available to the calling code.

<a name="traceability"></a>

## Implementation traceability {#traceability}

prisma/schema.prisma; prisma/migrations/20260907110000_khl_foundation/ and the following three KHL migrations; src/app/api/machete/khl/; src/khl/storage.db-test.ts. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.

<a name="protocol-aggregates"></a>

## Protocol aggregates {#protocol-aggregates}

KhlPlayerMatchStat.attackZoneSeconds — nullable individual attack time, seconds. Does not mix with TOI, puck possession, or team time in zone. The player API includes seasonStats: played, by sum/known/total fields. Aggregates are considered a SQL grouping of current unique facts and do not store a copy of the season or an unlimited process cache. Match history includes new fields and sources.

- 2026-09-11: canon activated; added VBA and match seasonal units.

- 2026-09-13: the read-only endpoint of the current Sports roster has been confirmed, import through the linked profile and resource boundaries has been added.

- 2026-09-13: Sports Last Season Archive, Normalized Limited Storage, New Metrics and EP Explained; numeric display up to two decimal digits.
