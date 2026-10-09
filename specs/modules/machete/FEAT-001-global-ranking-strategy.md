---
status: active
---

<a name="root"></a>

# FEAT-001: Automatic global ranking strategy {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

The squad planner gains a global-ranking mode, labeled `По глобальному рейтингу` in the UI. Rank, points, the gap to the leader, and field size are retrieved from Sports.ru or FPL. Squad selection departs from the popular template only within the permitted EP loss.

The full text dated 2026-09-06 is preserved below and in `docs/archive/planning/GLOBAL_STRATEGY_SPEC.md`. The user authorized this contract; implementation readiness and verification evidence are tracked separately in WI-001.

<a name="goal"></a>

## 1. Goal {#goal}

Give the user with the linked command a reproducible global K factor and valid squad with explicit EP comparison. If there are problems with the source, the usual selection remains available.

<a name="governing-specs"></a>

## 2. Governing specifications {#governing-specs}

- Related: `spec://modules/machete/FEAT-002-global-strategy-formula#root`

<a name="scope"></a>

## 3. Scope {#scope}

<a name="scope.in"></a>

### 3.1. In scope {#scope.in}

Two providers, automatic global context, pure K and strategyScore functions, application in squad selection, starting lineup, captain and transfers, EP loss budget, explanation and saving of settings.

<a name="scope.out"></a>

### 3.2. Out of scope {#scope.out}

Simulation of opponents, probability of victory, mini-leagues, new EP engine, automatic sending of transfers, full-fledged effective ownership model.

<a name="actors"></a>

## 4. Participants and triggers {#actors}

Fantasy-user with a linked Sports.ru profile or FPL entry. The admin does not set rank manually. The client cannot be sent someone else’s rank or entry as a personal setting.

<a name="scenarios"></a>

## 5. Scenarios {#scenarios}

The user enables the mode instead of balanced/reliable/upside. The UI shows the location, field size, backlog, remaining rounds, K, base and suggested predictions and reason. When K=0 - “Neutral strategy”. If the data is unsuitable, use the usual selection.

<a name="data"></a>

## 6. Data and state {#data}

Context: N, rank, team and leader points, T/R, ER for no more than 6 completed rounds, ownership of the same provider/tournament/season. GlobalContestStrategyState, UserGlobalStrategyState and GlobalStrategyRecommendation models. The setting is GLOBAL_AUTO in existing JSON filters.

<a name="contracts"></a>

## 7. Contracts {#contracts}

Production full Squad pool refreshes run in a terminating child process so native database working memory is released after each cycle. The scheduler keeps full and incremental work serialized until that child exits; parent shutdown terminates its child. Refresh hours, bootstrap-only-missing behavior, atomic READY publication, retained revisions, complete player data and request-time loading remain unchanged. Development without the production bundle keeps the same in-process implementation.

Pure functions in `src/machete/global-strategy.ts` and `src/machete/global-strategy-config.ts`. Loading the context into server/global-strategy-context.ts. `GET /api/machete/squads/global-strategy`. Integration into `src/machete/squad_logic.ts`, worker and `FantasySquadPlanner.tsx`.

`PATCH` of this route binds only the team of the associated profile in the selected season. `POST` maintains a compact recommendation audit: the server checks its own context and budget, and the sent forecast marks `CLIENT_EP_REPORTED`; This is not server-side verification of the forecast. The start and captain are selected separately for each round, the bench gives 0 EP until the auto-replacement model appears. Old pool snapshots are read by the regular UI and are sequentially rebuilt by workers in the absence of `providerIdentityVersion: 1`; incomplete mapping disables GLOBAL_AUTO until rebuilding.

<a name="player-identity"></a>

### Player identity and availability {#player-identity}

Provider/core player-name comparison folds non-decomposing Latin letters using
their CLDR Latin-ASCII equivalents (including ø/o, ł/l, æ/ae and ß/ss), before
the existing accent and punctuation normalization. Display names and source
identities are preserved. Name folding never relaxes uniqueness, birth-date,
club or existing manual mapping conflict checks.

The existing player-name search checks both the provider display name and
canonical FotMob name, including public nicknames such as Oso. Accent/Latin
letter folding applies to search while preserving Cyrillic letters and the
display names. The search field, filters and export selection retain their flow.

Shared canonical player imports preserve an established birthday when a roster
or match payload does not contain one. A supplied non-null birthday remains an
explicit observation; a newly created player may still have an unknown birthday.

An unmapped Sports price observed within 48 hours may resolve against the
canonical FotMob catalog when its current club resolves uniquely, its source
stat identity supplies a canonical Latin name with at least two tokens, and
both the complete birthday and a strong name comparison agree. Existing
uniqueness and competing-price checks still apply. Missing or contradictory
birthdays and stale observations cannot authorize this fallback. Availability
comes from the current provider price; no shared roster is activated and no
statistics or starter status are invented. Reviewed European club aliases are
explicit pairs, never a fuzzy cross-club match.

An explicitly reviewed `EXCLUDED` price identity remains excluded during
automatic mapping and normal price refresh, regardless of the recorded
exclusion reason. An exact catalog or roster candidate cannot undo that
decision; returning the card to mapping requires an explicit admin action.

FPL automatic identity matching still requires one exact normalized full name
inside the mapped current club. Compare FotMob position codes using the existing
fantasy position groups; LW/RW may be FPL MID, while a goalkeeper/outfield
contradiction and unknown roles remain rejected. Successful mapping changes
invalidate the price import's format-based idempotency key.

Every fresh FPL price with an agreeing MATCHED provider player map, canonical
player and club may supply a virtual current roster row to the planner, including
when the shared FotMob membership is inactive or absent. Price foreign keys
alone cannot authorize an override. Apply provider positions and current clubs
for that pool without activating shared memberships or replacing their starter
flags. Existing provider rules, saved selections and source-limited forecasts
retain their behavior.

<a name="transfer-rules"></a>

### Provider transfer rules {#transfer-rules}

Every squad-planning strategy uses three Sports.ru transfers per round. Unused
transfers do not carry forward. Round counters, suggestions, saved-plan rollover
and legacy opening allowances use this cap. Reading an older Sports.ru pool
snapshot applies the current transfer rule immediately without rebuilding its
player data or mutating its stored metadata. Russian and English descriptions
state three transfers per round without claiming accumulation.

FPL retains its separate provider rules: one new free transfer per round,
unused free transfers bank up to five, and extra transfers cost four points.

<a name="club-limits"></a>

### Provider club limits {#club-limits}

The user's corrected requirement is authoritative: club limits and transfer
quotas are separate rules.

Sports.ru Championship (48), Netherlands (57), Portugal (61) and Turkey (71)
allow two players from one club; the third is rejected by manual selection,
validation and automatic selection. Import defaults use the explicit league-ID
matrix. Correct the erroneously raised default-three contests only for Sports.ru 2026/2027 in
these four leagues, preserving other competitions and historical seasons.
The Squad snapshot shell reads the current contest's club limit without
rewriting cached player payloads or saved squads; stale snapshot metadata cannot
restore the former limit. Explicit operator contest limits and FPL rules retain
their existing behavior.

<a name="errors"></a>

## 8. Errors and validation {#errors}

INVALID_INPUT, INSUFFICIENT_SCORE_HISTORY, INCOMPLETE_CALENDAR, UNAVAILABLE, NEUTRAL, FINISHED. Do not substitute T=38, ER=70 or ownership=0 if data is missing.

<a name="traceability"></a>

## 9. Implementation traceability {#traceability}

Points of responsibility with `@spec`: `src/server/global-strategy-providers.ts`, `src/server/global-strategy-context.ts`, `src/server/global-strategy-cache.ts`, `src/server/fpl-price-sync.ts`, `src/machete/global-strategy-planner.ts`, `src/machete/squad_logic.ts`, worker contract/handler, `src/components/machete/GlobalStrategyPanel.tsx`, API global-strategy and migration `20260907000000_global_strategy`. Direct contract tests are located next to owning modules.

<a name="acceptance"></a>

## 10. Acceptance criteria {#acceptance}

- Numerical examples from FEAT-002 pass to tolerance 1e-6.
- 0 ≤ K ≤ Kmax; the leader gives neutral mode.
- Plan with negative EP delta only in GLOBAL_AUTO with positive strategic delta and budget B.
- Old modes do not change when the function is disabled.
- The user with suitable data receives K and squad with EP comparison.

<a name="relationships"></a>

## 11. Related specifications {#relationships}

- Related: `spec://modules/machete/FEAT-002-global-strategy-formula#root`

<a name="changelog"></a>

## 12. Changelog {#changelog}

- 2026-10-09: WI-063 — preserve verified birth dates and explicitly reviewed exclusions, require unique fresh name/date evidence for catalog identities, resolve reviewed European club aliases, search provider and canonical names, reconcile FPL position codes and include verified FPL price-backed virtual rosters without shared starter mutations.
- 2026-10-09: WI-059 — preserve the user's corrected two-player club cap in Championship, Netherlands, Portugal and Turkey, with current contest rules over stale snapshot metadata.
- 2026-10-08: WI-055 — correct Sports.ru to three transfers per round without accumulation, including older snapshot readers.
- 2026-10-04: WI-046 — terminating full-pool refresh processes preserve serialized publication and release native working memory.

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- [2026-09-07] Canon activated on behalf of the user; Responsibility points, client forecast audit, bench policy and updating of old pool snapshots are recorded.
- [2026-09-06] Imported the current canon from `docs/archive/planning/GLOBAL_STRATEGY_SPEC.md`.

## Source document

Historical text as of import date; The execution status is checked against WI-001.

# Specification: Automatic global ranking strategy

Date: 2026-09-06. Status: ready for implementation; The function code and migrations have not yet been created.

Related rationale and formulas: [GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md](../../../docs/archive/planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md).

## 1. Result for the user

The “By Global Rating” mode appears in the scheduler. The user links the Sports.ru profile or FPL entry, selects an existing tournament/season and turns on the mode. Field size, place, points, gap, possession and remaining rounds are loaded automatically. Manual entry of these indicators and mini-leagues are not needed.

When selecting, the following are shown:

- global place and field size;
- team points and gap from the leader;
- remaining available rounds;
- strategy intensity K/Kmax, separate from probabilities;
- base and proposed forecasts, expected loss, allowed limit;
- date of data and brief reason for recommendation.

Example: “250 from 500 · backlog of 100 · remaining 3 of the round. squad forecast: 69.4; basic version: 70.0; inferior to 0.6 points. A less popular squad was chosen within the acceptable loss.”

When K=0 display “Neutral strategy”. Do not promise protection of first place or probability of victory. The mode is chosen instead of balanced/reliable/upside, rather than being added on top of their heuristics. Existing modes retain their behavior when the function is disabled.

## 2. Limits of the first version

Included: two providers; automatic global context; individual configurations; pure functions K and strategyScore; uniform application in the selection of the squad, starting lineup, captain and transfers; limiting EP loss; explanation; saving settings; data quality check.

Not included: simulation of all opponents, probability of final victory, mini-leagues, new EP engine, automatic sending of transfers to the provider’s website, independent change of available bonuses, full-fledged effective ownership model. The current squad export/save transport is not extended by this feature.

The main mathematical mode is a limited deviation from the global pattern, taking into account the lag from the leader. The title and analytics should not replace it with maximizing the expected rank.

## 3. Data sources

### Sports.ru

Use existing client `src/lib/providers/sports-ru-fantasy.ts`, extending DTO and read queries:

1. User profile → `fantasyQueries.squads(input: {userID, isActiveTournament:true})`. Select a squad strictly according to the linked providerSquadId and seasonID. If there are several suitable commands without an explicit link, ask to select a command, do not choose arbitrarily.
2. `squads(input:{squadID,seasonID}) → seasonScoreInfo {place score totalPlaces}` - personal position. The request has been verified by a live response.
3. `tournament(...).currentSeason {id totalSquadsCount tours {...}}` - season and calendar.
4. `rating.squads(input:{entityID:seasonID,entityType:SEASON,sortOrder:DESC,pageSize:2,pageNum:1})` → `scoreInfo {place score totalPlaces}` - leader and second. Don't pass leagueID. Save timestamp; do not save the names of opponents if they are not needed.
5. Ownership - existing `seasonPlayer.status.selectedBy`, binding by providerPlayerId. Use the same tournament and season, not Foontasy as the primary source of strategy.
6. Official points of completed rounds - `squadTourInfo(input:{squadID,tourID}).scoreInfo.score`. The presence of the field is confirmed by the schema; Before implementing ER, check the live values ​​for completed rounds and their semantics. Do not take `seasonScoreInfo.averageScore=0` as a reliable average.

`totalSquadsCount` and `totalPlaces` may have different semantics for including commands before the first result. N must correspond to the rating: totalPlaces from the agreed rating slice takes precedence. The second number is diagnostic; do not replace N with it without checking.

### FPL

1. `/api/bootstrap-static/`: total_players, items with selected_by_percent, events and average_entry_score.
2. `/api/entry/{entryId}/`: summary_overall_rank, summary_overall_points, current_event; The global league is determined by the Overall system record. ID 314 is confirmed as of the research date, do not consider it a universal eternal constant.
3. `/api/leagues-classic/{overallLeagueId}/standings/`: first page, rank=1 and total leader, last_updated_data. Do not download the entire multimillion-dollar rating.
4. `/api/entry/{entryId}/history/`: completed team rounds for score scale. Expand client and exact allowlist `scripts/fpl-vpn-relay.mjs` for standings/history. Do not weaken the verification of origin and arbitrary paths. Standings confirmed by web request; the server path through relay is checked during implementation after adding the allowed route.
5. Fix create and update prices in `src/server/fpl-price-sync.ts` by writing selectedByPercent. Update sync format version if snapshot/hash deduplication will otherwise skip recovery. Existing data can be restored by normal successful synchronization; check 653/653 or the current pool size, do not include 653 in the code.

### General rules

We need explicit provider, contestId, season, entry/squad ID, source and time of each component. Only finite percentages are allowed in [0,100]; 0 is acceptable. FPL ownership cannot be taken from Sports.ru EPL. Normal ownership and captain exposure are different metrics.

Leader, team points and rank refer to the same stage of recalculation. Official completed round preferred. During the recalculation, do not mix the old rank with live points. If consistency cannot be confirmed, K is not calculated; standard selection remains available. For each adapter, define a contract test for temporal consistency on the stored anonymized response.

## 4. ER and calendar

ER - the average of official points of the linked team for the last no more than 6 completed rounds of participation. Use the same policy for two providers; store sampleCount and usedRoundIds. The round in which the team scored 0 is an observation, not a pass. Do not throw out negative values ​​for the sake of a positive average. No observations or average ≤0 - `INSUFFICIENT_SCORE_HISTORY`; do not substitute 70 silently. For 1–2 observations, show a small sample, but allow calculation; the early-season u itself severely limits K. This estimate is a scale, not a prediction of future points, nor is it the average variance of the field.

FPL average_entry_score to store for later verification/calibration; do not change the ER source unnoticed mid-season. Own played bonuses can affect ER; in the first version this is a reflected limitation. Later, the source of the scale or the exclusion of bonus rounds is changed only by the new version of the profile.

T — the total number of rounds of the current global standings, including those not yet played; R is the number of rounds of this competition with a still available solution deadline. Exactly at deadlineAt the round is no longer available. FPL double round - one gameweek, not two matches. An empty round exists in the calendar and does not disappear due to the lack of matches for the selected player. If the deadline has passed, the current unfinished round is not included in R.

For future planning, all subsequent R are considered relative to the corresponding deadline, but the current K in the first version is fixed at the time of the request: do not invent a future rank/G. Show that this is a strategy for the current situation.

Sports.ru cannot consider the last known 8 rounds of the Champions League a full tournament until it is confirmed that the standings are limited to them. The calendar policy is set by tournament and phase. For unknown T - `INCOMPLETE_CALENDAR`; this tournament does not receive an automatic K until a valid policy is added. No default T=38 for everyone.

## 5. Compute Core Contract

Suggested new files: `src/machete/global-strategy.ts`, `src/machete/global-strategy-config.ts`. Pure functions without Prisma, fetch, global cache, Date.now and modification of input objects.

```ts
type Provider = "SPORTS_RU" | "FPL";

type GlobalStrategyConfig = {
  version: string;
  provider: Provider;
  tournamentKey: string;
  kMax: number;               // старт 0.8, (0, 1]
  rankWeight: number;         // 0.4
  gapWeight: number;          // 0.6; сумма весов = 1
  gapScaleRounds: number;    // 3, >0
  urgencyExponent: number;   // 2, >0
  ownershipBonusScale: number; // 0.15, >=0
  maxExpectedPointsLossFraction: number; // 0.03, [0,1)
};

type GlobalStrategyContext = {
  provider: Provider;
  contestId: string;
  season: string;
  providerSquadId: string;
  revision: string;
  fieldSize: number;
  rank: number;
  managerPoints: number;
  leaderPoints: number;
  totalRounds: number;
  remainingRounds: number;
  roundScoreScale: number;
  scoreSampleCount: number;
  standingsRoundId: string;
  observedAt: string;
  expiresAt: string;
};

type GlobalStrategyEvaluation = {
  status: "READY" | "NEUTRAL" | "UNAVAILABLE" | "FINISHED";
  k: number | null;
  configVersion: string;
  contextRevision: string | null;
  rankRisk: number | null;
  gapRisk: number | null;
  urgency: number | null;
  maxLossFraction: number;
  reasonCodes: string[];
};

evaluateGlobalStrategy(context, config, now): GlobalStrategyEvaluation;
scoreGlobalStrategyPlayer({ expectedPoints, ownershipPercent }, evaluation, config);
evaluateGlobalStrategyPlan({ baseline, candidate }, evaluation, config);
```

The signatures of the last three functions should be specified by types during implementation; required semantics:

- `now` is transmitted externally; freshness is checked deterministically.
- INVALID_INPUT: fractional/unsafe rank/N/R/T, rank out [1,N], R out [0,T], NaN/Infinity, non-positive ER, non-matching profile/provider/tournament, negative G, rank=1 at positive G. Unusable inputs cannot be “corrected” with an arbitrary clamp.
- N≤1 with agreed rank and points - NEUTRAL; R=0 - FINISHED; leader/G=0 - NEUTRAL. For a correct one-day T=1,R=1 without played rounds - NEUTRAL, since there is no season position for adaptation yet.
- READY: formulas q/g/u/K from recommendations. The configuration is validated once, but the kernel does not trust invalid numbers.
- UNAVAILABLE returns k=null and a specific reason; it is not a numerical zero risk. The default selection runs the existing balanced.
- scoreGlobalStrategyPlayer returns `{expectedPoints, strategyBonus, strategyScore}`; the original expectedPoints is not changed.
- evaluateGlobalStrategyPlan returns `{eligible, expectedPointsLoss, maxExpectedPointsLoss, strategyScoreDelta, reasonCodes}`.
- Calculations do not round before display; budget comparison error ≤1e-6 points, do not use rounded UI numbers.

## 6. Optimization and transfers

1. Fix source EP and horizon H: use one selected formula/consensus in both passes. For FFO H=1 if there are no subsequent forecasts. K does not change the forecast engine.
2. Get a basic solution for the total expected points with the same budget, positions, team limits, fixations, exceptions, rules and available transfers. Remove old ownership/upside/form bonuses from this new basic pass; Leave some old regimes as they are.
3. Get strategic candidates by strategyScore. The bonus is considered at the player-round level and receives the same start/captainship multiplier as the corresponding EP. The bench accounting is the same as the base estimator and is documented; do not count all 15 players as starting ones. If there is no autocorrect model, do not promise the exact bench EP.
4. Evaluate the real EPs of each final decision again after selecting the XI/captain. Check budget B from recommendations. The captain of the next round uses the EP of the next round, not the amount for H rounds. For multi-round plans, captaincy and start are taken into account for each round; if no future plan is specified, apply the same explicit policy in both passes.
5. The basic solution is to always include the final candidates in the set. Select the allowed maximum strategyScore; in case of equality - more EP, less transfer penalty, fewer moves, stable ID order. The strategic delta must be strictly positive beyond the error, otherwise the basic solution.
6. For transfers B is considered relative to the best available plan, including “change nothing”, based on the full EP of the roster after penalties. Count the difference between incoming and outgoing bonuses, and not the bonus of only purchased ones. This removes the motivation for meaninglessly trading two equally rare players.
7. Non-positive netHorizonDelta is only allowed in the new mode if the plan passes B and improves the strategic assessment. Change early eliminations near the lines 1987 and 2016 `squad_logic.ts`; in old modes they are preserved. The Lost Points warning must remain visible.
8. You cannot add the original ownershipEdgeValue and transferCandidateScore bonus on top of the new bonus. The new mode uses one source of strategy and a single context for the captain and XI as well.
9. Early selection of eight candidates for the position now may lose the necessary options. Form a limited pool of candidates based on EP and strategyScore, including the basic solution and fixed players. Do not increase the search space without a limit; for v1, limit the list to 16 per position and maintain the overall limit of 120 000 transfer combination evaluations. When the limit is reached, specify searchTruncated=true.
10. The current search is heuristic. Base EP is the best found in a limited search, not a proven global maximum. Among the final candidate union, redefine the base as the maximum of the true EP and retest B; otherwise, the stronger basic option found by the strategic passage will remain unaccounted for. Any termination of the search returns the best valid option, including the base one.

A common possession for a captain is an approximation of a global template. Don't call it effective ownership. The rarity bonus does not override user-set minute/availability restrictions; Do not add new arbitrary medical or start filters to this mode.

## 7. Integration into an existing project

| File/layer | Change |
|---|---|
| `src/lib/providers/sports-ru-fantasy.ts` | DTO and limited global ranking/point requests |
| `src/lib/providers/fpl.ts` | DTO profile/history/standings, analysis of total_players and completed rounds |
| `src/server/fpl-price-sync.ts` | Saving selectedByPercent, restoring via sync |
| `scripts/fpl-vpn-relay.mjs` | Exact allowed paths standings/history |
| new server/global-strategy-context.ts | Loading, reconciliation, freshness and context normalization |
| `src/machete/squad_logic.ts` | K and evaluation of plans at all listed selection points |
| `fantasy-squad-worker-contract.ts` and handler | Passing compact context and version, single result |
| `FantasySquadPlanner.tsx` | New mode, position data, explanation and comparison EP |
| API squads and saving filters | Explicit allowed mode setting, reading/saving without losing other filters |

Suggested read endpoint: `GET /api/machete/squads/global-strategy?squadId=...`. Authorization is the same as for squads; checking the owner of the local squad; provider/contest/entry is determined by the saved binding. Do not trust the rank, points or arbitrary entry sent by the client when requesting personal settings. The response contains only normalized data, status/reasons and configVersion, not the raw profile with name/contacts.

Include contextRevision, configVersion, poolRevision, forecastSource and H in the Worker state. When changing squad/provider/pool or a new request, ignore the old response; override obsolete work with existing machinery. Recalculating K does not by itself trigger a reload of the entire player pool.

## 8. Storage, cache, duplicates and memory

Separate the general and personal parts:

- GlobalContestStrategyState: one current entry per provider/contestId/season, N fields, leader points, rating stage, T/R/calendarRevision, timestamps and sourceRevision. Local freshness logic does not change the provider's calendar.
- UserGlobalStrategyState: one current entry per userId/contestId/providerSquadId/season, rank/points, history of no more than 6 values ​​for ER, link to the agreed general revision and timestamps. The new binding does not reuse the previous context.
- User setting: GLOBAL_AUTO mode in existing JSON filters; not retain K as the primary source of truth. The update merges keys and does not erase roundPlans and custom formulas.

These are proposed new Prisma models, not existing tables. Add unique keys and migration. Do not duplicate price, ownership and player pool in these entries. Reloading one slice - upsert; updates to the general/personal parts are published only after consistency has been checked. If the source does not provide a general revision, use its available timestamps/round IDs and sequential reading check; the absence of an agreed cut is clearly indicated.

In-memory cache via ExpiringPromiseCache:

- general context: up to 32 records / 1 MiB, TTL 15 minutes outside of live recalculation, 5 minutes when updating the round;
- personal: up to 256 records / 2 MiB, TTL 5 minutes;
- total limit of concurrent new rating requests - 2 per provider; combine identical keys into one promise;
- retry: no more than one per temporary network error, with delay and without an infinite loop; 429 process by Retry-After and show the available state;
- old data can be shown with a date, but after expiresAt a new strategic result cannot be built. Deadline rollover invalidates the corresponding key regardless of TTL;
- ownershipRevision, forecastRevision, contextRevision and configVersion are included in the selection result key. Personal K results are not added to the player’s general cache;
- existing shared pool restrictions 96 MiB and overlay 32 MiB, as well as retention 3 revisions are preserved.

For future verification, save a compact snapshot of the actually implemented recommendation with source revisions, player IDs/multipliers, baseline/candidate EP, K and loss budget. Deduplication by user/squad/decisionRound/inputHash/configVersion; store the last 60 days. Export complete historical data for the study separately by explicit task; Do not accumulate daily copies of all players for each user.

When implementing, measure memory before/after repeated requests and check stabilization after eviction/TTL. One RSS snapshot cannot confirm the absence of a leak. Do not clear operational user data for this feature.

## 9. Tests and acceptance criteria

Mathematics:

- Check all five numerical examples from the recommendations with tolerance 1e-6.
- All other things being equal, deterioration of rank, increase in G, decrease in R do not reduce K; 0≤K≤Kmax for N=500 and N=10 506 303.
- Leader/tied on points, N=1, R=0, start of season, T=1, tied rank, wrong numbers, negative G, no ER.
- O=0/100 are valid; null and out-of-range values ​​do not give a premium and block GLOBAL_AUTO for a particular set of candidates. The usual EP selection is available.
- EP=0/negative does not receive a positive bonus. Formulas do not mutate inputs; repeated calls give the same result.

Integration and optimization:

- The same football player in FPL and Sports.ru receives its own provider context, EP and ownership. The provider mismatch is not corrected by fallback to another.
- FPL selectedByPercent is saved in both create and update; repeated sync does not create duplicates, and restoration is not skipped due to an old hash.
- Transfer penalty, no-op, identical players for several moves, team/positional limits, captain and bench do not break B’s budget.
- Regression example: a rare player with a noticeably lower EP does not displace a strong one if the solution exceeds B.
- A plan with a small negative EP delta can only appear in GLOBAL_AUTO if the strategic delta is positive and B is met. The loss is visible in the UI.
- The search does not lose the base squad due to the cutting off of candidates. If all strategic options are rejected, the base is returned; lack of a valid base returns an error from the normal optimizer.
- No re-ownership bonus. K=0 in the new mode gives neutral EP selection; turning off the function preserves the old strategies.
- API checks owner; saving the new mode does not erase the remaining filters. Worker uses fresh context, the outdated answer does not replace the current squad.
- Deadline crossing, rating update, 429/503, unknown tournament length, stale ownership and incomplete player mapping have distinct causes, without made-up meanings.

Performance: compare the current and new implementation on the same fixed Sports.ru/FPL pools; minimum 20 measurements after warming up. p95 of a complete new selection ≤2.5× basic, the UI remains responsive due to the Worker. The cache fits within the listed limits, there is no increase in the number of requests for each player and there is no endless background polling. If the limit is exceeded, optimize the search instead of silently turning off the EP loss check.

## 10. Utility testing and release

Functional tests prove compliance with restrictions, not improvement in athletic performance. The available data currently does not provide a complete, honest backtest of the global rank: the history of the images is short, the history of the entire field is not collected.

Before product inclusion, check the quality of the EP, the correctness of the sources and the actual loss relative to the database using the available images before the deadline. Candidate α/c/η/weights/εmax should be selected separately from FPL and Sports.ru separated by time, not from future results of the same round. If there is not enough data for the provider, the profile is marked uncalibrated and is available as an experimental opt-in.

Implementation procedure:

1. Sources, FPL ownership fix, calendar policy, checking ER on live completed rounds.
2. Prisma-context, freshness, bounded cache and pure math with tests.
3. Unified assessment and search with B, worker, integration tests.
4. UI/API/saving, explanation of the actual price of the strategy.
5. Local check, performance profile, duplicate/memory check; Existing mandatory repository checks on affected layers.
6. Experimental opt-in separately per provider/tournament. Expand inclusion after accumulating data, do not claim proven rank gains without relevant history.

First version completion criterion: user with associated command and valid data receives reproducible global K and valid squad with explicit EP comparison; If there are problems with the source, it continues to use the usual selection. There is no work with mini-leagues or manual entry of rating numbers.
