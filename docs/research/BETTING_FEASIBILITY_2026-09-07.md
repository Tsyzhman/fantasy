# Is it possible to beat a bookmaker using Fantasy Scout data?

Date: 7 September 2026. Study WI-002. Production read via SSH `deploy`; the application and database have not changed.

Continuation at the request of the user: [extended test of scales, calendar and weather, WI-003](BETTING_FEATURE_RESEARCH_2026-09-07.md). This document saves the results of the first, basic pass.

## Reply

**Sustainable ROI 20–30% on bet turnover is not confirmed by available data. The tested models did not show any advantage over the bookmaker.** There is enough data for a research prototype, but not enough to promise profitability. This is a test of a few reasonable basic approaches, not a proof that any profitable strategy is impossible.

ROI here is the net profit / the sum of all bets. This is not the original bank's return for the year. With the coefficient 2.00, the mathematical expectation of ROI 20% requires the true probability of winning 60%, and 30% - 65%. Formula for one bet: `EV = p × odds − 1`.

## What is actually stored on the server

| Data | Actual volume | Research value |
|---|---:|---|
| Matches | 21 343; completed 13 781 | 46 tournaments, 94 tournament and season combinations |
| Team statistics | 26 927 rows, 13 463 match | Goals, xG/xGOT, shots, shots on target, possession, corners, cards, etc. |
| Completed matches with xG of both teams | 10 513 | Basic material for modeling attacking and defensive strength |
| Player statistics | 473 577 lines, 11 439 matches | Minutes, starts/substitutions, positions, goals/assists, shots, passes, tackles, etc. |
| Impacts | 280 092, of which with xG 273 547 | 13 017 matches; coordinates, type, body part, situation, result |
| Events | 223 395 | 12 751 match; goals, own goals, cards, substitutions |
| Internal fantasy forecasts | 179 572 at the time of accurate calculation | Points and horizons, not ready probabilities of bookmaker outcomes |
| Foontasy forecasts | 21 822 | Additional source, requires separate control of publication time |
| Player Season Archives | 4 260 | Aggregates; you cannot substitute the season result into a forecast within the same season |
| Snapshots of Fonbet odds | 496 | Individual team totals 1.5 and derived probabilities |
| BaltikaTeamMatchStat / PlayerSnapshot | 0 / 0 | There is no separate Wyscout array in these production tables |

The earliest completed match is 14.06.2024, the latest is 06.09.2026. The main comparable sample of national leagues is from 2025/26 and the beginning of 2026/27; this is not a multi-year, uniform history of each league. Detailed breakdown - `specs/work/evidence/WI-002/league_coverage.json` and `player_coverage.json`.

Primary `pg_stat_user_tables.n_live_tup` was found to be very out of date for some tables. The numbers above are derived from the exact `count(*)`, not a PostgreSQL estimate. The database is served by working jobs, so tables and additional counters are unloaded sequentially, not in one global snapshot; modified forecasts may differ between reading times.

## Quality and time problems

1. **2 626 completed matches**is missing at least one final score field in `matches`, including all**380 Premier League matches 2025/26**. In team statistics there is a Premier League score, but in**36 cases ** it differs from the external archive. For example, Fulham - Manchester United, 24.08.2025: reserve team goals give 2:0, archive - 1:1; There is an own goal in the events. The reason for each discrepancy has not been separately investigated. In the experiment, for all matches compared, the result is taken equally from an external archive, including previous matches when constructing the form. Production was not corrected.
2. **12 540 from 13 781 matches** were added to our database after the game. Many past fantasy forecasts were calculated in August 2026. They cannot be passed off as predictions that were actually issued before the historic match.
3. **Fonbet history is being rewritten:** uniqueness `(match_id, provider)` and `upsert` save the last snapshot. There is no full log of odds changes, bets accepted, limit available and how our price compares to market close.
4. From 496 Fonbet pictures 331 refers to completed matches. Before the start, **122**was removed, more than 5 minutes -**121**, more than an hour -**27**. 209 timestamp coincides with the beginning or later. Most delays are less than a minute; only three more minutes. This does not mean that all 209 contain live information, but a strict pre-match test cannot consider them to be known to be available in advance.
5. There are no duplicates according to verified match keys, Fonbet and fingerprints of hits. Found one line of team statistics with a team that does not match the home or away team; the research connection takes only the exact home/away team IDs.
6. xG of players is filled in 150 769 lines from 473 577. A null value and no value are not the same; Some of the lines apply to substitutes and non-hitting players. Player props require separate checking of these semantics.
7. There are strange season markings: some 2025/26 cup matches are marked 2026/27. The test is broken down by game date rather than by season line.

## How the check was performed

Source of odds and results - [Football-Data](https://football-data.co.uk/downloadm.php), files `mmz4281/2526/{E0,E1,D1,I1,SP1,F1,N1,P1,B1,T1}.csv`. We used **closing odds of Bet365**, which are not the best prices in hindsight from different bookmakers. [The description of the ](https://football-data.co.uk/notes.txt) columns distinguishes the closing fields with `C` from the earlier snapshot.

From 3 533 archived matches matched **3 532**, one was excluded due to the lack of a clear match of date and teams. Matching uses the league, exact date and names of both teams; the outcome is not involved in the selection of correspondence. Weak name matches were checked manually. All 36 result discrepancies are retained rather than excluded from the outcome test.

Signs: last up to ten matches of each team in the same league, minimum five matches per team; average goals scored/conceded, xG for/against, shots and shots on target for/against, rest. Averages with a small fixed smoothing. All matches of one UTC day are processed before updating the history: statistics of the current match and games of the same day are not included in the signs.

Four options are compared: fixed Poisson based on past xG; logistic regression on form/goals/xG/shots; a mixture of 80% market probability without margin and 20% xG model; market probability without margin. The latter is a quality benchmark and a separate check of discrepancies between Bet365 and the average market. Margin withdrawals are only used to estimate probabilities; payments are always calculated according to real odds with a margin.

Chronological protocol:

- Training up to 01.11.2025: **466 matches** after warming up the history and checking the odds.
- Model/threshold selection for November–December 2025: **746 matches**.
- Regression retraining for the entire period until January, then a time-independent test between January and May 2026: **1 837 matches**. Parameters within a test are not overtrained; the previous form is updated as the calendar progresses.
- There are four models on the market × four model EV thresholds: 0%, 5%, 10%, 20%. Admission rule: positive validation ROI minimum on 50 bets. **No option passed this rule for either outcomes or totals.** Therefore, the study did not select a strategy to apply. The diagnostic results of the predefined threshold 5% for transparency are shown below.
- Fixed rate 1 unit; coefficients 1.20–6.00; a maximum of one selected selection per match in each individually reviewed market. Market performance does not add up to a supposedly independent portfolio.

## Received ROI

| Strategy with model EV ≥5% | Bet rates | ROI | 95% interval, blocks by week |
|---|---:|---:|---:|
| Exodus 1X2, past xG / Poisson | 1 388 | **−13,63%** | −25,27…−1,87% |
| Outcome 1X2, form + goals + xG + shots | 1 350 | **−7,48%** | −13,82…−0,73% |
| Exodus 1X2, 80% market + 20% xG | 307 | **−0,20%** | −27,21…+27,53% |
| Total 2.5, last xG / Poisson | 918 | **−6,13%** | −14,44…+2,06% |
| Total 2.5, form + goals + xG + shots | 986 | **−4,89%** | −11,31…+2,15% |
| Total 2.5, 80% market + 20% xG | 100 | **−16,59%** | −43,12…+10,69% |
| Fonbet, individual totals 1.5, last xG | 71 | **+0,28%** | −48,75…+55,14% |

Fonbet was checked separately for July–September 2026: snapshot more than five minutes before the start; The history of both teams must precede the day of the snapshot. From 121 there is enough history of such a match for 82; in 71 a model EV ≥5% was found. Profit is only **0,20 units**, maximum drawdown is **17,92 units**. Reducing the available coefficient by 2% turns the ROI into **−1,72%**. The EV threshold 10% gives +2,08% at 60 bets, and 20% - −23,07% at 43: these are diagnostic slices, not independent confirmations.

Intervals received 10 000 repeated samples of weekly blocks with a fixed seed. The big test has only 20 weeks, Fonbet has seven: the intervals are approximate and do not take into account all types of dependencies and the uncertainty of model choice. For Fonbet, the evidentiary power is especially low. The percentage of winning bootstrap samples is not interpreted as a probability of future profit.

Average bookmaker premium `sum(1/odds) − 1` in the test: **6,60% for 1X2**,**5,35% for totals**. This is a measure of quote margin, not the exact expected negative ROI of any strategy.

The market is more accurate than tested models and in terms of the quality of probabilities: log loss of outcomes **0,9899**for the average market versus**1,0248**for regression and**1,0379**from Poisson; less is better. For totals, respectively,**0,6723 / 0,6831 / 0,6819**. In this test, adding our simple xG model to the market also did not improve the overall log loss.

Interactive interval chart: `specs/work/evidence/WI-002/roi_intervals.html`.

## What has been proven and what has not yet been proven

Experimentally proven: normal past xG, results and hits alone did not give the tested models an edge over selected closing prices. The model EV 20–30% does not mean the real profitability of 20–30%: probability errors are concentrated precisely in the bets that the model considers the most profitable.

Not proven: inability to win at all, profitability of stronger models, earlier lines, specific Fonbet errors or player props. The test does not use full models of lineups/minutes, injuries, players, spatial shot profiles, price movements, cards and corners. Some of these markets have a statistical basis in our database, but there is no comparable price archive here.

This is a **retrospective reconstruction** and not a log of actual pre-match predictions: current versions of past public statistics are considered available after the day of the relevant game. xG versions and vendor fixes were not saved at that time. It cannot be argued that our production actually had such signs back then. Close from an external archive also does not prove acceptance of the required amount by a specific bookmaker. Taxes, account limits, and individual limits were not modeled; The test even before them does not show a stable plus.

The first diagnostic calculations were recalculated after correcting connections and a uniform counting source. After reviewing the test, the data quality was checked, but the models/thresholds were not changed to increase ROI. The entire study remains exploratory: this period has already been studied, so the next hypothesis must receive a new untouched period or forward-test.

## Where it makes sense to look for an advantage next

1. **Archive odds observations without overwriting.** You need bookmaker, event/market/selection, line, odds, receipt timestamp, start of game, prematch/live, availability status and, if possible, limit. Save the moment of your own forecast and input data.
2. **Check the price relative to the market.** Compare Fonbet with simultaneous quotes from several independent bookmakers, remove margin and check whether the advantage remains at closing. This is a separate hypothesis; the current database does not allow it to be fully tested.
3. **Explore one player market.** For example, shots/shots on target with a confirmed start: we have individual intensity, minutes and opponent profile. But we need historical lines, squads with publication times, rules for calculating bets and correct zeros. This is an area of ​​research, an unproven profitable niche.
4. **Correct agreements on scores, own goals, passes and seasons.** Verify outcomes with an independent source. Do not run the betting circuit on implicit fallbacks.
5. **Fix the model and evaluate new signals ahead.** The first requirement is a positive expectation after a realistically affordable price and expenses, stability over periods and improvement in probabilities/price. Thousands of bets provide more information, but are not an automatic certificate: with odds around 2.0 and independent odds 1 000 observations yield approximately ±6,2 percentage points for a 95% ROI interval near zero; 10 000 — ±2,0 pp. Dependency and large odds increase the required sample.

**A business plan with a constant ROI 20–30% based on this database is now unfounded.** There is an opportunity to look for rare price errors; the existence of a sustainable advantage remains to be proven.

## External bases

- [Kaunitz, Zhong, Kreiner: Beating the books with their own numbers](https://arxiv.org/abs/1710.02824): the study identified quote errors relative to the market and included real rates; also describes the limitations of successful clients. This is an example of a benefit opportunity, not an estimate of our ROI.
- [Dmochowski, PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0287601): A profitable bet depends on probability relative to price, and not just on the ability to guess the winner.
- [Chronological validation, scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html): motivation to separate the past and the future. Fixed calendar windows and feature lags are implemented here, not a random train/test split.
- At the request of the project, discussions on Reddit and Stack Overflow about leakage, choosing a threshold on the test and prices that are not available in retrospect were studied; The numerical conclusions of the report are not based on evidence from the forums.

## Reproducibility and resources

`specs/work/evidence/WI-002/inputs.zip` contains one compressed instance of sports input data and external CSVs; The SHA-256 of each file is listed in `input_manifest.json`. Personal data, secrets and user tables were not uploaded. SQL worked in read-only transactions, with a query limit of 30 seconds and `work_mem=8MB`; models are calculated locally.

Restore input data from repository root:

```powershell
Expand-Archive -LiteralPath specs/work/evidence/WI-002/inputs.zip -DestinationPath .tmp/betting-research-20260907 -Force
python scripts/research/betting_backtest.py
python scripts/research/betting_evaluate.py
python scripts/research/betting_report.py
```

Used Python 3.14, NumPy, pandas, SciPy, scikit-learn, Plotly. The exact versions are saved in `verification.json`. For new unloading - `python scripts/research/betting_audit.py`; it accesses a live database, so it does not exactly reproduce the previous snapshot.

The independence of signs from changes in results/statistics of the same day and the future, the payout formula, the absence of a repeated bet on one match within the strategy and the holdout date were checked. The full grid, specific selected rates and coverage are saved. Production was not restarted, containers for tests were not created. Memory and status control - `resources.txt`.

The automatic check rejected cleaning the local `.tmp/betting-research-20260907` and Python cache with the reason `blocked by policy`, without specifying. About 20 MB of temporary entries, pickles and logs remain along with a verified compressed archive of 1,69 MB. The evidence also contains three identical sets of bets for lead>0 and lead>5; they represent the same rates in the two conditions, rather than additional observations. When replayed, the code saves only lead>5 and lead>60. There are no research processes in the background.

Was: assumption of possible high ROI and unmatched data sources. Now: verifiable audit, reproducible simulations, recorded limitations and negative results for proven approaches. The product code, UI and production data have not been changed.
