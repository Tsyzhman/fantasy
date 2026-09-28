---
status: active
---

<a name="root"></a>

# FEAT-002: Global strategy formula {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

A separate strategyScore adjusts squad selection away from the popular template using rank and the gap to the leader. Player expected points must not be replaced with popularity. The first version is a bounded heuristic, rather than an estimate of the probability of winning.

The full text dated 2026-09-06 is preserved below and in `docs/archive/planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md`.

<a name="goal"></a>

## 1. Goal {#goal}

Fix the formula K and strategyScore, which is implemented by FEAT-001, along with starting coefficients and a ban on replacing EP with popularity.

<a name="governing-specs"></a>

## 2. Governing specifications {#governing-specs}

- Related: `spec://modules/machete/FEAT-001-global-ranking-strategy#root`

<a name="scope"></a>

## 3. Scope {#scope}

<a name="scope.in"></a>

### 3.1. In scope {#scope.in}

Formulas q, g, u, K; separate strategyScore; EP loss budget; versioned profiles FPL and Sports.ru.

<a name="scope.out"></a>

### 3.2. Out of scope {#scope.out}

Selection of overtaking probability, mini-leagues, replacing EP with AdjustedEP.

<a name="actors"></a>

## 4. Participants and triggers {#actors}

Same squad-planner user as FEAT-001. The formula does not have a separate screen.

<a name="scenarios"></a>

## 5. Scenarios {#scenarios}

K is growing with a worse position, a larger lag and a smaller share of the remaining season. The leader receives K=0. Lack of ownership disables the strategic premium rather than being treated as 0%.

<a name="data"></a>

## 6. Data and state {#data}

N, rank, G, T, R, ER, ownership of the same provider. Parameters α/c/η/weights/εmax are starting engineering hypotheses, an unselected optimum.

<a name="contracts"></a>

## 7. Contracts {#contracts}

Formulas and examples from the source document. Core - pure functions FEAT-001; this document does the math.

<a name="errors"></a>

## 8. Errors and validation {#errors}

Incorrect N/rank/G/ER are not corrected by an arbitrary clamp. Lack of ownership blocks the recruitment allowance for candidates.

<a name="traceability"></a>

## 9. Implementation traceability {#traceability}

Pure functions and profiles: `src/machete/global-strategy.ts`, `src/machete/global-strategy-config.ts`. Direct formula tests: `src/machete/global-strategy.test.ts`. Applying the budget to the roster and transfers: `src/machete/global-strategy-planner.ts` and the test of the same name.

<a name="acceptance"></a>

## 10. Acceptance criteria {#acceptance}

Five numerical examples of the original document are reproduced to tolerance 1e-6. The football player's EP does not mutate.

<a name="relationships"></a>

## 11. Related specifications {#relationships}

- Related: `spec://modules/machete/FEAT-001-global-ranking-strategy#root`

<a name="changelog"></a>

## 12. Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- [2026-09-07] Canon activated on the direct instructions of the user to implement the strategy.

- [2026-09-06] Imported the current canon from `docs/archive/planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md`.

## Source document

Historical text as of import date; The execution status is checked against WI-001.

# Adjustments to the global strategy formula

Date: 2026-09-06. Status: proposal for implementation and testing, not implemented.

## 1. Purpose

The function automatically selects the degree of deviation from popular players based on the global position of the linked team. Sports.ru - a separate field for each tournament and season; FPL — Overall of the current season. Mini-leagues and manual rating entry are not included in the task.

The proposed first version is a limited squad selection heuristic. It does not estimate the probability of winning, does not guarantee an improvement in final placing, and does not convert possessions into additional expected points. To optimize the probability of overtaking, distributions of results and joint outcomes of the squad and opponents are needed.

## 2. What to change and why

| Was in offer | Offered | Reason |
|---|---|---|
| AdjustedEP replaces EP | Save EP; enter a separate strategyScore | Popularity does not change the expected result of a football player |
| Ownership from undefined field | Only global ownership of the same provider, tournament and season | Sports.ru EPL and FPL have different management teams and rules |
| ln(N)/ln(500) multiplies the entire K | Remove separate FieldFactor | With millions of participants it inflates K; N is already participating in the percentile |
| RankRisk = q^1.3 | Start with linear q | Power 1.3 reduces all internal values with respect to q; there is no empirical basis for it |
| GapRisk = G/(G + ER × R) and separate urgency | Normalize G in normal round units; time to be taken into account separately | We remove the repeated amplification of time and the false interpretation of ER × R as an available wagering |
| Urgency = 10/(R+10) is added even to the leader | Urgency multiplies the need for the chase and depends on the share of the season completed | The leader does not become more aggressive just because the end is approaching; seasons of different lengths are comparable |
| Kfinal = 0.05 + 0.90K | Explicit clamp and permissible K=0 | Linear transformation does not guarantee boundaries and creates mandatory aggression |
| Large rarity bonus with no loss limit | Small bonus plus strict EP loss budget of the entire solution | Rare weak player should not win due to one multiplier |
| One setting for all | Versible profiles FPL and SPORTS_RU, Sports.ru has overrides for the tournament | Points, calendar, transfers, bonuses and field scale are different |
| Unknown ownership is treated as 0% | Use a fresh source; on failure, disable strategic surcharge for request | Lack of data does not mean rarity |

## 3. Proposed formula of the first version

All parameters below are starting engineering hypotheses. They check the implementation and constrain its behavior; These are not statistically selected optimal odds.

Designations:

- N — global field size; rank — the team’s position according to the same rating section.
- G = leaderPoints − managerPoints, non-negative lag. A negative difference means inconsistent data, not the need to silently reset G.
- T - the total number of comparable rounds of this classification; R is the number of remaining rounds that can still be influenced before the deadline. R is not equal to the forecast horizon H.
- ER - positive scale of points for one round, automatically assessed based on official completed rounds. This is a unit of normalization, not an estimate of available wagering.

```text
q = (rank − 1) / (N − 1)
g = G / (G + c × ER)
u = clamp((T − R) / max(T − 1, 1), 0, 1)^η

K = clamp(Kmax × u × (wRank × q + wGap × g), 0, Kmax)
```

Starting profile: `c=3`, `η=2`, `wRank=0.4`, `wGap=0.6`, `Kmax=0.8`. The weights are summed up in 1. Separate configurations are created for FPL and Sports.ru; before calibration, the same values ​​are acceptable. There is no need to invent differences in coefficients without data.

If the team is in the lead or shares the lead on points - K=0. When R=0 - the season/available solutions are over, there are no recommendations. Until the first completed round - neutral mode. When N≤1, a competitive strategy is not needed. An inconsistent calendar or rating blocks automatic K.

Why this form: worsening place or increasing lag, all other things being equal, does not reduce K; decreasing R does not reduce it. The lag and place give a meaningful need for the pursuit, and u gradually increases its influence. The u square delays significant aggression until later in the season. This is a consciously conservative setting that needs to be checked, especially for short tournaments.

K=0 for the leader means neutral selection according to the forecast. This is not a complete leadership defense strategy: global ownership does not describe the squad of second place. Protection cannot be promised in the interface.

### Examples K

When N=500, T=38, ER=70:

| Location | G | R | K |
|---|---:|---:|---:|
| 1 | 0 | 1 | 0 |
| 250 | 100 | 35 | 0.0021 |
| 250 | 100 | 19 | 0.0829 |
| 250 | 100 | 3 | 0.2814 |
| 490 | 300 | 1 | 0.5959 |

Examples check the arithmetic and direction of change of K; they do not prove athletic performance.

## 4. Ownership and cost of deviation

For one “player-round” pair:

```text
o = ownershipPercent / 100
bonus = α × K × max(EP, 0) × (1 − o)
strategyScore = EP + bonus
```

Starting `α=0.15`: with Kmax=0.8 the premium does not exceed 12% positive EP. The negative prognosis remains; it does not improve by multiplying rarity. There is no need to repeatedly multiply the bonus by forecastConfidence or minutes in the first version: this can repeat the amendments already taken into account in the EP, and confidence is not the probability of a successful performance.

Even a limited bonus is not enough. First, the basic feasible solution with the highest EP among the considered solutions is found, then the strategic one. For the same horizon, forecast source, set of restrictions and rules:

```text
ε(K) = 0.03 × K / Kmax
B = ε(K) × max(baseExpectedPoints, 0)
candidateExpectedPoints ≥ baseExpectedPoints − B
```

`baseExpectedPoints` and `candidateExpectedPoints` already take into account the real starting lineup, captain and transfer costs. If the base forecast is 70 and K=0.4, the allowed loss is 1.05 points. This is an upper limit, not a required sacrifice.

Bonus determines strategic sorting, and B separately limits its damage. In the UI, show both EP and loss relative to the base solution. Don't call strategyScore a score prediction.

Example of the original problem: when K=0.8, the original formula prefers EP=6/O=5% (10.56) to the player EP=8/O=80% (9.28). The proposed premium gives 6.684 and 8.192 respectively. However, you need to check the budget of the entire squad, and not just an individual player.

## 5. Fundamental restrictions

The expected separation of the squad from the fixed field in the simplified model is equal to `Σ(x_i − o_i)EP_i`, where x_i is its own exposure. The second part does not depend on our choice. Therefore, the positive contribution of the selected rare player cannot be presented as proof of optimality: missing players and joint outcomes must be taken into account.

Low ownership does not prove high dispersion. The current upside mode in the project uses the spread of forecasts between rounds; This is also a calendar effect, and not a distribution of a random result. Do not use this spread as σ for the probability of winning and do not automatically add it to the new bonus.

For a captain, normal ownership does not equal effective field exposure: it does not include captaincy shares, starts or bonuses. In the first version, the bonus for normal possession is only a clearly indicated approximation. An effective holding that could exceed 100% would require a separate field and a different formula; it cannot be limited like a regular percentage.

Falling short of first place in a multi-million dollar FPL is an aggressive goal. This version retains the original focus on the leader, but does not claim that such a target is better for the average final place. If a product needs optimization to reach a certain global top, this is a separate goal determination and verification, without mini-leagues.

## 6. Data and sources

Verified by 2026-09-06: public Sports.ru GraphQL returns `seasonScoreInfo.place/score/totalPlaces`, `totalSquadsCount`, rating `rating.squads` by SEASON without leagueID. In the Russian tournament at the time of inspection there were 18 926 teams, the leader was 478 points. `averageScore` in the verified answer was equal to 0, so the presence of the field cannot be taken as a usable statistic.

FPL returns `total_players`, `summary_overall_rank`, `summary_overall_points`, `selected_by_percent`, events and Overall rating. In the current code, selectedByPercent is lost when upsert the main price table, although it is present in the saved data of all 653 players.

Primary research sources support modeling of rivals, variance, and correlations, but not the coefficients proposed here:

- Haugh, Singal, How to Play Fantasy Sports Strategically (and Win): https://pubsonline.informs.org/doi/abs/10.1287/mnsc.2019.3528
- Picking Winners in Daily Fantasy Sports Using Integer Programming: https://arxiv.org/abs/1604.01455
- Verified FPL rating: https://fantasy.premierleague.com/api/leagues-classic/314/standings/
- Sports.ru GraphQL: https://www.sports.ru/gql/graphql/

Discussions were used to find practical questions, not to prove coefficients: https://www.reddit.com/r/FantasyPL/comments/1f3942y/ ; https://stats.stackexchange.com/questions/212719/suggestions-for-simple-model-of-who-wins-the-league-in-a-game-of-fantasy-footbal

Detailed specification: [GLOBAL_STRATEGY_SPEC.md](../../../docs/archive/planning/GLOBAL_STRATEGY_SPEC.md).
