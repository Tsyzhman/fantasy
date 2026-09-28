---
status: active
---

<a name="root"></a>

# FEAT-003: hockey score forecast and optimizer {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Projections and squad selection use hockey data and explicitly show its quality.

<a name="goal"></a>

## Goal {#goal}

Select a valid lineup based on expected points without future data and fictional xG.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. Canon is active upon user request; source/rules gates determine the availability of relevant features, not the status of the document.


<a name="scope"></a>

## Scope {#scope}

Calculate the expected FP of each hockey player for the remaining matches and select acceptable 17 players/transfers. The ready-made xG of the selected supplier is used, without its own model of the probability of a goal of an individual shot. We reproduce the forecast using the input revision, rules and modelVersion, without LLM and undated advice.

Do not transfer football parameters `deterministic_fantasy_projection.ts`, per90, 60-minute probability, football clean sheet, xA/assist coefficient 0.8 or FPL captain/bench. Independent hockey configs with training/calibration for the KHL.

<a name="inputs"></a>

## Inputs and quality {#inputs}

For each match: date/time, home/away, opponent, pause between matches, back-to-back, official fantasy week, still available participation time, regulation/OT/SO outcomes, latest compatible Fonbet markets. An incomplete calendar blocks aggregate weekly recommendation because EP depends on the number of games.

Field: last 5/10/20 matches, actual TOI and PP/PK TOI, PP share, observed or estimated role, G/A/SOG/+/−/PIM, ready individual and team xG as determined by the supplier, injuries/disqualifications. Brief history of shrink to hockey team/position/league prior with markings, not to football per90. EV/PP/PK xG is not deducted from the total if the cut is not supplied; The ALL-only model remains a separate version with appropriate coverage.

Goalkeepers: `P(start)` per match, `P(plays without start)`, conditional TOI, saves/GA rates, opponent's attack strength, probability of change/full match, rest and rotation, injury and confirmed information. Ready-made xGA/GSAx with separate coverage. The starting six of a completed mobile match gives a historical target, not confirmation of a future start. Official future starter is nullable, model probability is marked ESTIMATE. The distribution of starts is agreed between the goalie of the club: the sum for all candidates and UNKNOWN_OTHER=1; Don't limit yourself to two fantasy goalies.

For each attribute: value/null, quality FACT/ESTIMATE/UNKNOWN, source, asOf, sampleSize and coverage. The list of injuries does not cover every brief injury. An unknown injury does not prove health; a conditional recommendation must convey uncertainty. XG-01 and PP TOI coverage from INFRA-001 - dependencies of the main forecast.

<a name="forecast"></a>

## Model EP {#forecast}

Pure function accepts inputs, rulesVersion, modelVersion and `asOf`; does not read the database/clock itself. The per-match model first specifies participation/time states, then associated match outcomes and individual events. Output: EP total, breakdown, dispersion/interval with calibrated distribution, start/appearance/TOI/PP expectations, inputRevision and warnings.

For the field conceptually:

`EP = 10 E[G] + 5 E[A] + 2 E[plusMinus] − E[PIM] + E[appearancePoints] + E[teamResultPoints] + E[defenderShutoutPoints]`.

The components are conditional on participation and correspond to the verified version of scoring. TOI/PP affect exposure and G/A probability; There is no separate bonus for the power play. For data with an EV/PP cut, the rates are modeled separately, but the PP effect is not multiplied again on top of the overall rate already taken into account. The assist forecast is assessed in hockey events (two assists per goal are possible), not by a football constant. xG is a sign of expected performance, not ready FP and does not equal actual goals.

For goalie:

`EP = E[appearancePoints] + E[teamResultPoints] + 20 P(eligible full-game shutout) − 3 E[eligible GA] + E[floor(SV/2)]`.

Take into account joint events participation/start/change/team outcome. You cannot first include `P(start)` in EP and then multiply by it a second time. `E[floor(SV/2)]` is not equal to `floor(E[SV]/2)` and not equal to `0.5 E[SV]`: count according to the discrete distribution of saves. Likewise, thresholds 10/40 minutes are calculated using the TOI distribution rather than the rounded average. Until the exact threshold rules are confirmed, component quality remains provisional.

Odds are used as probabilistic signs/calibration of hockey strength taking into account settlement; incorrect/removed lines are excluded. Absence of distant quotes → clearly indicated baseline force, not zero and not the nearest football line. If there is no xG, the field remains null: baseline EP can be separately available as beta, but xG mode is considered not ready.

EP of the week - the sum of only the player’s available matches that have not yet been played, taking into account the possession time in the scenario. The fact of FP of the already played period is shown separately. The default horizon is the current official week; you can 2–4 weeks with obvious boundaries. Do not multiply the average FP by the conditional “three games”.

<a name="optimizer"></a>

## Optimization and transfer plans {#optimizer}

Independent hockey solver, clean input and typed result. For the initial squad, binary `x_i`:

- `sum x_i=17`, `sum_G=2`, `sum_D=6`, `sum_F=9`;
- `sum price_i*x_i ≤ availableCapital`, `sum_club x_i ≤3`;
- keep selected player → `x_i=1`; exclude → `x_i=0`; unavailable for purchase cannot become in;
- duplicate/unmapped/no-price cannot be included in the confirmed recommendation squad.

The goal of v1 is the maximum amount of EP in the remaining matches without a captain and bench. Risk shown separately; do not claim to maximize global rank/tournament winning probability. Known injury/suspension affects through participation, and source transfer lock affects through the permissibility of the operation. For incompatible keep/exclude/club/position, issue an infeasible explanation rather than silently relax the restrictions.

For transfers, start from a specific baseline and state of the week. Each out/in pair = one transfer used; returning what was sold later also costs the transfer. The final symmetric difference does not replace the log. Up to 5 operations after the start of the week, minus those confirmed to be used and planned in the same scenario; no transfers/paid extra operations from FPL. Each step checks the budget, positions, club, lock and moment of action. The very fact of rescheduling does not consume the external limit.

v1 offers immediate valid substitutions; future time steps - conditional scenarios with price/lock recheck. The official unlocking time is not known in advance. Profitability of the plan = EP over the ownership intervals of the new squad minus EP “do not change anything” on the same horizon and inputs. Selling before today's match loses this match; purchasing after a match has already passed does not acquire it.

Approach: limited integer optimization/branch-and-bound with deterministic tie-breaks, pruning, time limit and cancellation. Select a specific library spike by bundle/runtime and license, do not include a heavy solver without measurements. Up to 1000 candidates and 5 seconds; no more than 5 returned plans. When timeout, return a valid incumbent with `optimality:"not_proven"`, bound/gap if known; in the absence of an acceptable result - `TIME_LIMIT_NO_SOLUTION`, and not proven infeasible. The response contains requestId, inputRevision, seed if there is a simulation, elapsedMs and reasons for the restrictions. The server checks the solution independently.

<a name="validation"></a>

## Backtest and quality of model {#validation}

Rolling-origin by game week: training only on data available before the forecast. For each field source availableAt; closing odds, official starting lineups and corrected xG, which appeared later, do not fall into the historical profile. If the source does not provide a publication history, the limitation of specifying and using a prospective shadow test is to not pass off the backfill backtest as leak-free.

Minimum previous full season, independent last ≥8 weeks holdout and current season shadow ≥2 official weeks. Beginners/few matches/new club/goalie separately. FP MAE metrics by positions and weekly total, calibration goalie start (Brier/reliability), interval coverage if there are intervals. Compare with the baseline “last 10 FP/G matches × real remaining games” and a variant of the same model without xG. Separately analyze PP and the number of matches; do not select hyperparameters on holdout.

Proposed forecast release gate: MAE is not worse than the baseline in general and for no position by more than 5%; goalie-start Brier is no worse than the baseline historical start frequency; the gain from xG/odds is revealed by ablation, even if it is zero. Show sample counts and comparison uncertainty. Do not promise improvement before measurements. If the criteria are not met - beta label, reasons and a ban on presenting the model as verified. The xG source gate is independently required for the promised xG functionality.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- MOD-01: same inputs/versions give same EP; breakdown is summed up, null and coverage are visible, no hidden calls to LLM.
- MOD-02: TOI thresholds, odd SV, goalie/change/OT/SO participation and no PP data processed; no double multiplication by P(start).
- MOD-03: postponing the match and updating the role/price/injury/odds/xG invalidates the old revision; a future starter is not presented as a fact without a source.
- OPT-01: on small sets the solver coincides with exhaustive search; on a full pool, returns only valid 17/2/6/9/club/budget solutions with the correct optimality label.
- OPT-02: 5-th/6-th transfer, re-purchase, locked out/in, keep conflict, pre-match sale and transfer were tested by successive scenarios.
- OPT-03: timeout/cancel/stale input distinguishable from infeasible; after 50 launches there is one worker, there is no retention of old pools.
- MOD-04: rolling-origin report, ablation xG/odds, Brier, MAE by position, data leakage audit and shadow period are attached before beta is removed.

<a name="relationships"></a>

## Related specifications {#relationships}

`spec://modules/khl/INFRA-001-khl-data-ingestion#xg-gate`, `spec://modules/khl/INFRA-003-khl-fonbet-odds#markets`, `spec://modules/khl/FEAT-001-khl-module-and-rules#scoring`, `spec://modules/khl/FEAT-002-khl-squad#cards`.

<a name="changelog"></a>

## История {#changelog}

- 2026-09-20: WI-026 — KHL-only архив даёт известные событийные суммы, но без полного знаменателя участия не влияет на историческую вероятность выхода; официальные FP не выводятся из протокола.

- 2026-09-07: при интеграции сохранены исходные anchors и требования; добавлены обязательные разделы текущего standalone протокола и трассировка реализации. Draft gates не сняты.

- 2026-09-07: создана спецификация хоккейного прогноза FP и оптимизатора на готовом xG. Модель не обучалась, solver не реализован.

<a name="actors"></a>

## Participants and triggers {#actors}

The user sets the horizon and restrictions; publishing the model records the input data and its availability time.

<a name="scenarios"></a>

## Scenarios {#scenarios}

Checking inputs #inputs → calculation #forecast → selection and transfers #optimizer → independent quality check #validation.

<a name="data"></a>

## Data and state {#data}

Архив `sourceKind=KHL_PROTOCOL` не содержит полной истории пропусков: его games/dnp не используются как prior участия. Проверенные событийные суммы доступны для ставок событий; FP/otherPoints с count=0 не добавляют наблюдений.

Ready ixG, TOI, participation, goalkeeper start, joint distributions, model/data revisions and EP components (#inputs/#forecast).

<a name="contracts"></a>

## Contracts {#contracts}

No participation twice; E[floor(SV/2)] is calculated by distribution. Worker is limited by time, the result is re-checked by the server (#optimizer).

<a name="errors"></a>

## Errors and validation {#errors}

Missing data blocks a full forecast; timeout/cancel differ from proven impossibility. FP10 beta baseline is not considered a trained xG model.

<a name="traceability"></a>

## Implementation traceability {#traceability}

src/khl/forecast-model.ts, optimizer.ts, domain.test.ts, forecast-model.test.ts; src/server/khl/forecast-publication.ts. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.


<a name="rolling-beta"></a>

## Basic forecast for the next 7 days {#rolling-beta}

Archival SOGs are taken from the exact KHL protocols if the Sports archive does not contain them. The implementation additionally uses past goals and shots known together in the same protocols, with a maximum weight of 20 of past matches. FP, G/A/+/−/PIM and Sports participation frequency retain their sample; source coverages do not stack like different matches.

Before verification of official weeks, the calendar mode “Nearest 7 days · estimate” is separately available. It does not assign a fictitious fantasy week to matches or make unconfirmed transfers available. Official weeks and the horizon 1–4 weeks are saved in a separate mode.

EP uses up to 10 recent matches and the last completed season of the same player. Each known indicator is smoothed: (current sum + k × past average) / (number of current observations + k), k = min(20, number of past observations). This is a fixed beta assumption, not a trained coefficient. Without past data, current data is used; without current ones - past ones with obvious markings. Unknown fields are not replaced with zeros. The frequency of PLAYED among PLAYED/DNP is smoothed out in the same way and is not reported as the probability of a goalie starting.

For field EP per match played = 10 × expected goals + 5 × assists + 2 × plus or minus − penalty minutes + other points. Other points are the remainder of the official FP after subtracting G/A/+/−/PIM on the same full match observations. Expected goals = 0,5 × smoothed goals/match + 0,5 × shots on target/match × conversion; the implementation is calculated only from the jointly known G/SOG and is smoothed by the current league to 50 shots. If SOG is unknown, rate of goals with warning is applied. Shots do not receive an additional official bonus and goals do not count twice. For the goalkeeper, a smoothed average of official FPs is used, preserving discrete scoring.

EP horizon - the sum of forecasts of future SCHEDULED matches for seven days. Each forecast is multiplied by the participation frequency exactly once. For field players, a complete fresh Fonbet triple 1/X/2 for 60 minutes after removing the proportional margin sets the beta correction of the attack: factor = 0,75 + 0,5 × (P(team wins) + 0,5 × P(draw)). Baseline expectations for G/A/SOG are multiplied by factor; PIM, +/− and other remaining FP are preserved. The range 0,75–1,25 is an explicit fixed, not yet trained assumption, rather than inferring goal intensity from the probability of winning. For the goalkeeper's official FP, such an amendment does not apply. No fresh full line → factor=1 with reason; obsolete/retired/untested lines are not used. Further, separate training on the archive is possible, but it is not declared ready.

The card and EP tip show the base expected G/A/SOG/PIM/+− for the match played, the individual adjustments of each future match, and the total expectations of the selected horizon with participation. The snapshot stores current/historical sums, coverages, weights, blended averages, paired G/SOGs, and implementation smoothing; the interface reveals formulas with these inputs. The model window is fixed: the last 10 records PLAYED/DNP; The 5/10/20 table-average selector does not change this model window. There is no complete event breakdown → forecast based on official FPs with a clear reason, null event expectations. No history, incomplete calendar or missing connection between player and club → null. The model is labeled BETA_BASELINE; Estimation of pace of goals is not given to ixG or trained model.

Worker publishes only when the calendar is fully covered and updates after input data changes or one minute has passed. Reading accepts only current dataRevision and publication no older than an hour. A replay without changes uses the same revision. Basic publications and child forecasts older than seven days are deleted together; for the v4 model, no more than 96 of the latest publications for the tournament are additionally saved, so that minute recalculations do not bloat the storage; no unlimited process cache.

- 2026-09-11: separate rolling beta EP for 7 days without inventing official weeks; frequency of participation and storage limitation.
- 2026-09-13: last season as a prior and a single explainable calculation of G/A/SOG/PIM/+/−.
- 2026-09-14: a snapshot of the initial calculations, visible expected indicators and individual match adjustments for the freshly verified Fonbet line (WI-023).
