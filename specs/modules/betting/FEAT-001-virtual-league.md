---
status: active
---

<a name="root"></a>

# FEAT-001: Virtual Fantasy League {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Fantasy users compete against five algorithms using virtual coins. Each participant receives 100 000 coins once. Odds come from Fonbet; the application does not send bets to the bookmaker. All five algorithm assessments are visible before confirmation. Placing a bet is optional.

<a name="scope"></a>

## Scope {#scope}
Independent function. Restrictions: specs/common/main.md, existing authorization, docs/operations/DEPLOYMENT.md. Only pre-match football in leagues from the general Squad list (fantasySquadLeagueFotMobIds), regardless of loading statistics. The filter shows the entire list in Squad order, including leagues with zero events. No payments, coin withdrawals, promises of profitability, automatic resets, other sports and virtual football. Ambiguous comparisons cannot be resolved by guesswork.

<a name="goal"></a>

## Goal {#goal}
Compare decisions of people and algorithms in the general league using real pre-match quotes.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}
Independent canon; higher product and operational restrictions are listed in scope. The adjacent Machete specifications do not change.

<a name="actors"></a>

## Participants and triggers {#actors}
Active Fantasy user, five automatic participants, settlement administrator and background worker.

<a name="scenarios"></a>

## Scenarios {#scenarios}
The user opens the match, reads the scores, selects the outcome and confirms the amount or skips the event. The work cycle updates the line, saves bot decisions and calculates completed matches. The administrator checks other markets and records the source of calculation.

<a name="data"></a>

## Data and state {#data}
BettingAccount stores the balance and connection with the User or bot name. BettingEvent stores the current market listing and match mapping. BettingBet keeps the accepted price and outcome unchanged; BettingLedger - postings. BettingDecision stores the participant's last decision on an event. BettingSyncState stores lease, success time and error.

<a name="contracts"></a>

## Contracts {#contracts}
GET /api/betting returns the league page, ?event= - listing of the selected match, ?admin=pending - settlement queue for ADMIN. POST supports bet, skip and settle. Reception, protection and settlement contracts are specified by ledger, feed, settlement and errors below. History shows the latest 100 bets, ranking up to 200 participants; all transactions are saved.

<a name="traceability"></a>

## Implementation traceability {#traceability}
Code responsibility: src/betting/domain.ts, src/betting/provider.ts, src/betting/service.ts, src/betting/sync.ts, src/app/betting/ui.tsx, src/app/api/betting/route.ts.

<a name="ui"></a>

## Interface {#ui}
Section /betting in general navigation: league filter, search, grouping of markets of the selected event, single outcome coupon, history, algorithm solutions and rating. The coupon shows the odds, payout, five ratings and calculation method. There is an obvious omission of an event. Equity rating: available balance plus face value of open bets. ROI based on the turnover of calculated bets without refunds.

<a name="opportunities"></a>

## Opportunities in the {#opportunities} line
The list of events is sorted by time or by the best estimated EV among outcomes that received a BET from at least one algorithm. By default, EV first; Sorting of the entire selected league/search is done before pagination. Equalities are resolved by time and ID. An event shows the best EV and number of unique matching outcomes; one outcome with five scores is counted once.

In an open match, a separate block lists all unique eligible outcomes in descending order of best EV, with odds and supporting algorithm names/EVs; selecting opens an existing coupon. Five personal tips are saved. Multiple outcomes of the same match can be linked: EVs do not add up, selection does not create an express bet or an automatic bet. EV is an experimental estimate and not a guarantee of profit. The BET threshold and the rule of one outcome per match for bots do not change.

The `_opportunities` summary is stored in an existing JSON snapshot of the model and is replaced atomically along with the quotes. Contains algorithm version, quote time, kickoff, quantity and best EV; no separate history lines and no cumulative cache in memory. Applies only to the same snapshot, current version and open line not older than 5 minutes. Old entries without a summary show that there is no up-to-date score until a normal worker update or match opens. Model paintings/history are not transferred to the list API; updating the selected event also updates the list. An expired score loses its highlighting without rebooting.

<a name="ledger"></a>

## Balances {#ledger}
100 000 coins are awarded to the participant once along with a unique transaction. Accounting in whole hundredths of a coin. The user bets whole coins from 1 to 100 000 and no more than the balance. The debit and bet are atomic with account blocking. A unique request key protects network replays. Changing the coefficient requires new confirmation. The outcome, parameter, rule, price, recommendations and time are unchanged. Open bets cannot be canceled at the user's request.

Inside an open match, five algorithm cards are displayed: the best available outcome with odds, EV and reason, or “It’s better not to bet here” with an explanation. Tips apply only to the selected match and do not depend on the match filter; an expired line does not provide an active recommendation.

<a name="feed"></a>

## Line {#feed}
listBase - events; events/event - full list; factorsCatalog/tables - names. Only football, place=line, future tense, no blocking. Acceptance of quotation no older than 5 minutes; The match, which started according to any reliable source, is closed. Disappeared/blocked factors are not available. Unknown selection names are shown as unsupported, without accepting a bet. There is only one current snapshot per event; accepted prices remain in the bids. The API displays event pages and a description of only the selected event.

<a name="settlement"></a>

## Calculation {#settlement}
Clearly supported outcomes are automatically calculated based on a reliable result of regulation time: 1X2, double chance, totals, individual totals, both will score, Asian handicap. Whole lines allow returns, quarter lines are divided in half. The disputed score and possible overtime are pending review. Timed, statistical and special markets are available with a noticeable feature of manual settlement. ADMIN indicates the result, source and cause; the calculation applies to all identical selections. Cancellation of a match returns bets; disappearance of a line is not a cancellation. Re-calculation does not re-credit money. The source and administrator are saved. Blanks are not replaced by zero or the sum of the players' goals.

<a name="algorithms"></a>

## Algorithms {#algorithms}
Mia - goals/xG 50/50, latest 20 games; Abella - 25/75, strict threshold; Lana - short form of 8 games; Riley - goals and rest; Adriana - careful agreement of long and short form. Exponential weights, shrinkage to league average, home advantage; only completed games before the target match. Insufficient history and unsupported markets mean "missing out", with no fictional probability. Versions and factors have been published. Weather is not included without a verified operational forecast. Each bot bets a maximum of one outcome per event, up to 1% of the initial bank, open risk maximum 10%. EV takes returns into account. Solutions are experimental and saved.

For the Champions League/UEL, the history is limited to two years before the target kickoff: up to 20 games of the national championships and 8 matches of the general stage of the corresponding European Cup. The long model window saves up to 12 + 8, the short model window saves up to 5 + 3; in the absence of one source, it is supplemented by the available one, without duplication. If the match score is empty, explicit goals from both teams from MatchTeamStat with an exact match of team ID are allowed; incomplete or inconsistent pairs are eliminated and the players' goal sums are not used. The average level of the European Cup is calculated based on at least 30 past matches of the general stage. Numerical rounds 1–8 of the general stage have a 90- minute format and allow automatic calculation; unknown stage and playoffs remain under regular time review. This is an experimental policy, not proof of profitability.

<a name="runtime"></a>

## Runtime and operations {#runtime}
Individual accounts, transactions, events, rates, decisions and synchronization status. Cycle only in worker, distributed lease eliminates overlap; BETTING_LEAGUE_ENABLED=false disables it. HTTP time, response size, and number of events per loop are limited. The directory has a TTL cache. Postings and rates are not deleted; old events without bets/decisions are cleared in batches. Release: additive migration, backup/restore/canary via canonical promoter.

<a name="errors"></a>

## Errors and validation {#errors}
Active Fantasy sessions only; your account; manual calculation only ADMIN. Modifying queries check origin, JSON, sizes and types. Insufficient coins, a closed market, outdated prices and ambiguity provide an understandable error without changing the balance. The Fonbet failure is visible and is not replaced by a synthetic line.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}
src/betting, src/app/betting, src/app/api/betting, worker, migration and direct tests have @spec. Competition, replays, returns, dates/sources, bot limits, authorization, mobile UI, revision/health, duplicates and memory are checked.

<a name="relationships"></a>

## Related specifications {#relationships}
Studies BETTING_FEASIBILITY_2026-09-07 and BETTING_FEATURE_RESEARCH_2026-09-07 describe limitations and do not confirm profitability.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).
- 2026-09-07: Sorting events by estimated EV, a summary of unique outcomes, and a general list of several suitable options within a match.
- 2026-09-07: the canon was adopted on direct instructions to implement the league.

- 2026-09-07: list and coverage of leagues synchronized with Squad on behalf of the user; the presence of loaded statistics does not limit the line.

- 2026-09-07: inside the open match there are five cards, one per algorithm: the best available outcome with odds, EV and reason or “It’s better not to bet here.” Search by painting does not hide tips. The legacy line does not provide an active recommendation.

- 2026-09-07: on behalf of the user, the manual calculation tab has been removed from the Arena; the accrual of virtual winnings and the secure service settlement API are preserved.

- 2026-09-07: fixed selection of national leagues + last Champions League/UEFA Champions League and ban on all European Cup forecasts; version of algorithms 2026-09-07.2.
