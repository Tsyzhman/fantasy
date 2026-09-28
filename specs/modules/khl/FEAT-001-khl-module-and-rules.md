---
status: draft
---

<a name="root"></a>

# FEAT-001: separate KHL Fantasy module and Sports.ru rules {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

A separate hockey competition with verifiable rules and 17 active players.

<a name="goal"></a>

## Goal {#goal}

Prevent soccer scoring and calendar from being applied to hockey.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. The document remains draft until the listed source/rules gates are closed.


<a name="scope"></a>

## Scope {#scope}

The user opens “KHL” next to the FPL, selects a season/game week, sees the catalog and plans the Sports.ru lineup with hockey statistics, ready-made xG and Fonbet odds. Development of your own xG model is not included. Prediction of fantasy points based on ready-made xG is included in a future implementation.

Includes the 107 Tournament regular season, history, calendar, custom local roster options and transfer recommendations. The tournament/season is discovered and confirmed by the source, and not permanently sewn up like 107/2026–27. Playoffs, NHL, auto trades on Sports.ru, betting, managing other people's rosters, news through LLM and restoring full lines based on guesswork are not included. Saving a variant in the application does not perform an external transfer.

<a name="navigation"></a>

## Navigation {#navigation}

- `/machete/khl/squad` - main screen; `/machete/khl/players` - catalog/comparison; `/machete/khl/calendar` - matches and weeks.
- In `MacheteShell` add the “KHL” item, available according to the same rules for accessing the workspace. Internal tabs - “Squad”, “Players”, “Calendar”. Do not use the “FotMob data” signature for the KHL.
- URL and saved settings include `contestId`, `seasonId`, `weekId`, `squadId`, valid hockey filters. Alien squadId returns 404.
- Server `KHL_ENABLED` is disabled by default; API is also checked. Separate switches `KHL_SYNC_ENABLED`, `KHL_FORECASTS_ENABLED`. The shutdown does not affect football.

<a name="rules"></a>

## Rules version {#rules}

Main source - [tournament rules 107](https://www.sports.ru/fantasy/hockey/tournament/rules/107.html), re-retrieved HTTP 200 2026-09-07. The page does not explicitly mark the season version: store hash, fetchedAt, verifiedAt, providerContestId, season mapping and a separate version of our ruleset. Checking the current season is required before switching on.

| Parameter | Contract |
|---|---|
| squad | Exactly 17 unique players: G=2, D=6, F=9; positions 1/2/3 is matched against verified cards |
| Budget | Initial 20 000 whole units Sports.ru. This is not 100.0, not thousands and not the currency |
| Club | No more than 3 in any saved full version of the squad |
| Participation | All 17; without bench, captain, vice-captain, auto-correct and chips |
| Location | Cosmetic, does not change glasses; the lines on our site are not real links to the club |
| Transfers | Before the start of the tournament without a weekly limit; after the start, a maximum of 5 for the official week. Do not transfer FPL accumulation and fine −4 |
| Action | Instant from the moment of external operation; It is not possible to receive points from a sold/bought player retrospectively |
| Price/capital | The price changes after the match, the cost of the squad along with it; available funds = bank + current value of holdings |
| Banning | The player is banned 30 minutes before the match; unlocking after an indefinite period of time after the game. We need a new provider lock, you can’t assign “end of match + N minutes” |

`bank` is a separate confirmed value. Revaluation of existing players is not added to the bank a second time. Selling and buying use the price of one fresh photo; There is no special sales price/commission. With an unverified external sales value, the operation remains only a scenario. The budget is not limited again 20 000 after the increase in the cost of the team.

<a name="weeks"></a>

## Weeks and time {#weeks}

The rules call Monday 04:00, but do not explicitly state the time zone. We offer Europe/Moscow display, UTC storage; The reset timezone must be confirmed for a specific tournament. Source of game weeks above the arithmetic calendar. The week entity contains providerWeekId, label, startsAt/endsAt (nullable before verification), timezone, source, verificationStatus, revision. Interval after check half-open `[startsAt, endsAt)`.

In the September 6 check, the first week card indicated the end of 14 September; September 7 Sprong's card still places September 7/11/13 in the week 1, September 15 in the week 2. You can't automatically reset the counter 7 September just because it's Monday. The date “14 September” without time/zone cannot be declared as a proven UTC deadline.

Maintain an explicit connection between match ↔ fantasy week, including exceptions and transfers. If there is a week boundary/assignment conflict, show the source calendar, block recommendations that depend on the controversial reset, and set `WEEK_BOUNDARY_UNVERIFIED`. Do not carry over points already awarded between weeks until the official adjustment. Changing the calendar increases revision and invalidates the forecast/plan.

<a name="scoring"></a>

## Official scoring and local reconciliation {#scoring}

Official FP from Sports.ru - the source of the final result; local calculation is separate, with breakdown, rulesVersion and status `provisional|verified|mismatch|insufficient_data`.

| Event | G | D | F |
|---|---:|---:|---:|
| Team victory in regulation time | 3 | 3 | 3 |
| Victory in OT/shootout | 2 | 2 | 2 |
| Lost in OT/shootout | 1 | 1 | 1 |
| Goal/assist | Not determined by table | 10 / 5 | 10 / 5 |
| Unit +/− | Not applicable | 2 | 2 |
| Penalty minute | Not defined by table | −1 | −1 |
| Time is strictly greater than 40 minutes G / 10 field minutes | 2 | 2 | 2 |
| Time is strictly less than the threshold with the participation of | 1 | 1 | 1 |
| Dry match: full for G, >10 minutes for D | 20 | 10 | — |
| Dry match D at <10 minutes | — | 5 | — |
| Missing washer | −3 | — | — |
| Every two saves | 1 | — | — |

There are no separate bonuses for PP goals/assists; PP is a sign of forecast. Saves are grouped in pairs, not 0.5 for each: control Isaev 21 SV, 1 GA, 60:00 and victory in regulation time → 10 − 3 + 2 + 3 = 12 official FP (observation 6 September).

Open rules: exactly 10:00/40:00; awarding team points to a non-player/substitute; goalkeeper changes, empty nets, shootouts and individual GAs; rare goals/assists/goalkeeper penalties, clean match during substitutions. An empty rules cell does not mean a confirmed zero. Such breakdowns should not be declared accurate until reconciliation with official FPs. 0 TOI does not equal “played less than the threshold”. Sports.ru states that accruals will be made within 24 hours after the completion of the round matches; this does not guarantee instant updates after each match.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- RULE-01: 2/6/9 is valid and capital is within available limits; rejected duplicate, 4-th club player, incorrect position, 16/18 players.
- RULE-02: rearranging slots does not change FP/EP; none of 17 becomes spare.
- RULE-03: changing the date to 7 September does not reset the week of 1; unchecked boundaries are visible; the transfer recounts the remaining games.
- RULE-04: 21 save gives 10 points for saves; Isaev gives an example 12. Threshold and goalie edge cases are covered by official samples or remain clearly unconfirmed.
- RULE-05: 5 used transfers are prohibited sixth; pre-season shift and new confirmed week vary; the unknown remainder is not substituted as 5.

<a name="relationships"></a>

## Related specifications {#relationships}

- `spec://modules/khl/FEAT-002-khl-squad#transfers`
- `spec://modules/khl/INFRA-002-khl-storage-and-api#transactions`
- [Sources and open dependencies](../../../docs/research/KHL_SOURCE_EVIDENCE_2026-09-07.md)

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- 2026-09-07: during integration, the original anchors and requirements are preserved; added mandatory sections of the current standalone protocol and implementation trace. Draft gates have not been removed.

- 2026-09-07: rules and boundaries project created; no implementation.

<a name="actors"></a>

## Participants and triggers {#actors}

User plans squad; the administrator confirms the source, rules and official week.

<a name="scenarios"></a>

## Scenarios {#scenarios}

Navigation is described in #navigation, squad and budget in #rules, week boundaries in #weeks, FP reconciliation in #scoring.

<a name="data"></a>

## Data and state {#data}

Rule and week versions have their own IDs; official FPs are not mixed with the EP forecast (#rules, #weeks, #scoring).

<a name="contracts"></a>

## Contracts {#contracts}

KHL routes from #navigation use separate DTOs; unverified rules do not receive verified status.

<a name="errors"></a>

## Errors and validation {#errors}

Unknown week, disputed TOI boundary, and missing protocol indicate an unknown value with a reason, not a null result.

<a name="traceability"></a>

## Implementation traceability {#traceability}

src/khl/rules.ts, scoring.ts, domain.test.ts; src/app/machete/khl/. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.
