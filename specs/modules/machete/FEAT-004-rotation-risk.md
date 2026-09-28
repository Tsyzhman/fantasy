---
status: active
---

<a name="root"></a>

# FEAT-004: RR - risk of rotation {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Each player receives a rotation-risk indicator based on observed starts, bench appearances, and rest. This is an initial heuristic, rather than a calibrated probability.

<a name="scope"></a>

## Scope {#scope}
Show RR in the scheduler and apply in “Reliable”. EP forecast, balanced/upside/GLOBAL_AUTO and K modes do not change. Load and trend are not added separately; selection of weights and risk of injury outside the scope.

<a name="goal"></a>

## Goal {#goal}
Make rotation risk a separate explainable indicator using a user-approved formula, with the source data clearly available.

<a name="actors"></a>

## Participants and triggers {#actors}
The squad-planner user sees RR and selects the selection mode. The existing ingestion populates the normalized history, and the background materializer updates the pool without asking for history on each render.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}
Player's own risk contract; Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`.

<a name="data"></a>

## Data and state {#data}
Source - MatchPlayerStat.started/minutes and CoreMatch.finished/cancelled/matchDate by internal playerId. The schedule for the next match is taken from the same pool/tournament. Adds a compact rotationRisk field to the player DTO and RR version/expiration metadata to the existing snapshot JSON. There are no new tables or migrations.

<a name="formula"></a>

## Formula {#formula}
For N = 50,20,10,5, take the last no more than N completed observations with known started. RN = BenchN / (StartsN + BenchN). started=false means known bench, including substitution; started=null and no entry do not mean benched. Duplicate matchIds are counted once. Incomplete windows use the actual number of observations with a small sample mark, without inventing missing games.

restDays — full intervals of 24 hours between the last completed match of a player with minutes>0 and the nearest future kickoff. Scale 0–1/2/3/4/5+ days: 1/0.72/0.40/0.16/0 (the original 0.25/0.18/0.10/0.04/0 is divided by 0.25).

RR = clamp(0.15 R50 + 0.20 R20 + 0.25 R10 + 0.25 R5 + 0.15 Rrest, 0, 1).

With zero history, unknown rest or kickoff, the result is null with a reason. No data from the future: completed matches must be before min(observedAt, kickoff). The result contains version RR_V1, kickoff, observedAt, four compact windows and reasons; the full history is not transmitted to the client.

<a name="contracts"></a>

## Contracts {#contracts}
Clean core `src/machete/rotation-risk.ts`; loading `src/server/rotation-risk.ts`. For one pool, IDs are deduplicated; one SQL query per batch for up to 250 players, up to 50 history lines per player and last appearance, no HTTP requests and permanent additional cache. The history is limited to existing FotMob normalized observations across all uploaded competitions; the indicator does not indicate the completeness of missing squads.

Pool/DTO/Worker is passing `rotationRisk`. In “Reliable” with a suitable RR score = max(0, consensusEP × (1−RR) × (0.75+0.25 confidence) × sourceMultiplier). confidence has an existing fallback 0.55, sourceMultiplier is preserved. The previous minutes/appearance/number risk notes penalties are not re-added. If the RR is unknown or outdated, the same reliable score is retained. The RR for the nearest match is used as a current criterion for the reliability of the lineup, not as the probability of all matches on the horizon.

RR has a TTL of 24 hours and expires no later than kickoff. Snapshots from RR_V1 are updated sequentially when there is no version or TTL has expired; the old pool remains readable. Changes in the initial history are reflected during the next pool update.

<a name="scenarios"></a>

## Scenarios {#scenarios}
The “RR%” column is available by default in new table settings and in the selection of existing columns. Tooltip explains windows/rest/data shortage. An unknown/obsolete RR is shown as “—”, without being replaced by 0%. The RR is unknown until the light pool is enriched.

<a name="errors"></a>

## Errors and validation {#errors}
NO_KNOWN_LINEUPS, UNKNOWN_REST and NO_FUTURE_FIXTURE result in null. SHORT_HISTORY allows calculation on actual windows and is shown as a sampling constraint. An expired/foreign version or an incorrect RR numeric value is not used. DB errors remain errors from the existing pool update; The previous READY snapshot is saved by the standard mechanism.

<a name="traceability"></a>

## Implementation traceability {#traceability}
`src/machete/rotation-risk.ts`, `src/server/rotation-risk.ts`, `src/machete/squad_logic.ts`, `src/machete/squad_planner.ts`, `src/machete/fantasy-player-pool-snapshots.ts`, `src/components/machete/FantasySquadPlanner.tsx`.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}
Example R50=.2,R20=.25,R10=.3,R5=.4,rest=2 gives .363. All rest thresholds, 0/1 boundaries, empty/short history, duplicates, unknown statuses and future data are covered by tests. DTO, reliable fallback/EP saving, batching and column preferences have been tested. Production build and change-related checks pass. Live DB smoke runs when the environment is available; is not replaced by a statement about the completeness of the data.

<a name="relationships"></a>

## Related specifications {#relationships}
Related: `spec://modules/machete/FEAT-003-squad-player-card#root`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).
- [2026-09-07] User instructed to add RR; accepted baseline with normalized rest, without load/trend.
