# Advanced check of scales, calendar and weather

WI-003, 7 September 2026. Continuation of WI-002 at the request of the user. Production has not changed.

## Output

**A wider search did not confirm the stable ROI 20–30%.** Options with a positive ROI were actually found in the selection: approximately +8–13%. The next season they did not reproduce this result. The next season is still represented by a small sample; negative results do not prove the impossibility of an advantage at all.

The first pass was a test of the basic models. Now **548 configurations of models/weights** have been completed: 259 for outcomes, 259 for totals, for 15 options in two weather experiments. This is not 548 independent confirmations: the options use common matches and are strongly related.

## What old studies were found

The project contains:

- `src/machete/formula_adaptations.ts`: hypotheses of form for 3/5/10 matches, freshness, team style, possession, tackling/passing, coach, formation, opponent, zones and rest.
- `src/machete/formula-adaptation-models.generated.json`: Trained weights and metadata from the FotMob/H2H study for 2024/25–2025/26. For one formula, the accepted freshness/selection windows are 3/5 matches, for the other 5/5; form and style more often than not in ten matches. Weather is clearly ruled out: `weatherIncluded: false`.
- `scripts/export-formula-adaptation-models.py`: exporter referencing `run_formula_hypothesis_research.py` and archived replay JSON gzip.
- `docs/testing/MODEL_BACKTEST.md`: confirmed fantasy backtest and its limitations.

The original research archive itself and `run_formula_hypothesis_research.py` were not found in the checked places: current project and transfer worktree, relevant server directories `/var/www`, `/var/backups`, `/home/deploy`, `/tmp`, `/root`, file names in Downloads and Codex outputs. User location hint requested. This is a limited search, not a statement that a file is missing from all drives.

An important limitation of the found artifact: the training cohort - **who actually started and played more than 60 minutes**; the goal is fantasy glasses. This is not a ready-made proof of the profitability of bets and is not a reason to transfer its final weights to the past. The new experiment uses the ideas of time windows and factors, and the models are re-trained on the correct calendar periods. Coaches, schemes, personal minutes and zones have not been added to the new team betting test: they require a separate restored history of attributes. A complete reproduction of the previous fantasy research is not claimed.

## How the experiment was expanded

A complete archive of coefficients **2024/25**has been added to the previous data, and**2026/27** is allocated for the next period. Source - [Football-Data](https://football-data.co.uk/downloadm.php), the same ten leagues/divisions: Premier League, Championship, Germany, Italy, Spain, France, Netherlands, Portugal, Belgium, Turkey. The closing odds of one bookmaker Bet365 are checked.

Signs and options:

1. Windows **3, 5, 10, 20** of previous matches. Inside the window, fresh games receive more weight; Half-life is half the length of the window.
2. Shares of xG in the assessment of strength **0%, 25%, 50%, 75%, 100%**, the remaining share is goals. In the old season without its own xG, goal history is used, with separate indicators of the presence of xG in the trained models. The old xG is not made up.
3. Shots/shots on target for and against; short and long form; home/away results; Elo; the league's historical performance level.
4. Days since the last match, opponents' rest difference, rest indicator ≤3 days, number of games for **7/14/21 day**. For teams associated with production IDs, the calendar includes available cup games; for the old season, without such a comparison, it is incomplete and mostly league-specific.
5. Manual correction to the intensity of goals during an asymmetrical short rest: **0, −0,04, −0,08** in exponential form. It is tested separately from the trained calendar coefficients.
6. Mixing statistics and market probabilities with a share of statistics **10%, 25%, 50%**.
7. Logistic regression with four levels of regularization, with and without calendar; gradient boosting with three tree sizes, with and without market probabilities.

Time comparison:

| Period | Purpose | Matches |
|---|---|---:|
| 2024/25 and part of 2025/26 until January 2026 | Training | 4 890 |
| January–May 2026 | Selection of models and thresholds | 1 838 |
| 7 August – 3 September 2026 | Next period | 220 |

Numbers after warming up the history with at least three matches, checking the fields and odds. 220 - available intersection, not all matches played at the beginning of the season. January–May has already been studied in WI-002 and is now honestly considered a development period.

In each family, the option with the minimum validation log loss is first selected, then the model EV threshold from **0%, 3%, 5%, 10%, 20%** with the best validation ROI is selected with a minimum of 50 bets. Options with negative validation ROI are kept for diagnostic purposes and are not declared suitable for betting. Coefficients 1.20–6.00; unit rate; one selected outcome per match within the market. Files `*_frozen.json` are written until the next season is evaluated. The final season is not included in training or selection; models are not retrained on it.

## What happened when setting up the scales

Best Poisson in terms of quality of selection probabilities:

- **Outcomes:**window 20,**50% goals + 50% xG**, manual calendar correction 0.
- **Totals:**window 20,**25% goals + 75% xG**, manual calendar correction 0.
- When mixed with the market, the best was a small share of its own statistics - **10%**. This is the result of a specific criterion and sample, not universal correct weights.

Zero manual penalty does not mean that rest is never affected. It means that the selected fixed penalties did not improve the validation log loss. In regression and boosting, rest is also included as separate trainable traits.

| Selected family representative | Selection ROI | Next period ROI | Next period bets |
|---|---:|---:|---:|
| 1X2: Poisson, optimized head mix/xG | −10,99% | −9,61% | 155 |
| 1X2: form regression without calendar | −6,80% | −6,48% | 187 |
| 1X2: form regression with calendar | −6,41% | −3,54% | 174 |
| 1X2: regression of form, calendar and market | −2,55% | −0,35% | 141 |
| 1X2: boosting form, calendar and market | **+8,90%** | −56,82% | 11 |
| Total: Poisson, optimized goal mix/xG | −3,12% | −10,46% | 78 |
| Total: shape regression | **+2,96%** | −25,59% | 34 |
| Total: form, calendar and market boosting | **+8,11%** | −8,46% | 13 |

The remaining representatives and all 518 bad weather configurations are stored in `rich_results.json`. The table shows, in particular, all positive validation options among the selected family representatives; the profitable next result is not hidden.

For outcomes, the market has a log loss of 0,94377, boosting with the market is 0,94263 on the next 220 matches. For totals, a mixture of the market with xG - 0,64443 against the 0,64546 market. Small improvements in accuracy are present, **they themselves did not prove a profitable strategy**.

## Weather really tested

Used [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api), model ECMWF IFS 0.25°. Signs - temperature, precipitation, wind, each with the suffix **`_previous_day1`**: forecast about a day before the corresponding hour, and not the actual weather after the match. English start time has been converted from Europe/London to UTC to accommodate daylight saving time.

Forecasts have been received for **1 932 matches**, 49 English teams from the Premier League and Championship for the seasons in question. Modeling on the same suitable lines: **1 316 training / 460 selection / 54 next period**.

Coordinates - author's [directory of FCHD stadiums 2023/24](https://fchd.info/maps/GAZ2023-24.htm). This is an approximate geography: the movements of stadiums within the city between seasons have not been separately restored, including Everton; in fact, a rough weather grid 0.25° is used. Neutral stadiums, the microclimate of the stands and the condition of the lawn are not modeled. This limits the conclusion, especially with a small sample.

| Weather test | ROI of selection | ROI of the next period | Bet |
|---|---:|---:|---:|
| 1X2: market/form/rest regression without weather | +8,51% | −22,26% | 42 |
| 1X2: the same family with the weather | +8,97% | −36,17% | 23 |
| Total: boost without weather | +12,67% | −40,90% | 10 |
| Total: boosting with weather | **+13,25%** | −23,73% | 11 |
| Total: regression without weather | −8,28% | +3,33% | 42 |
| Total: regression with weather | −7,15% | +1,97% | 37 |

The threshold was chosen separately for each option, so the difference in ROI in the table is not a pure causal effect of weather. To compare the accuracy, the same matches were used: for the regression of totals, adding weather slightly improves the validation log loss **0,71129 → 0,71095**and the next period**0,67016 → 0,65851**. This is a reason to continue studying the factor, but not proof of profitability: +1,97% was obtained on 37 bets with an approximate 95% weekly bootstrap interval**−27,13…+25,53%**.

The full result also contains the case of a positive following ROI without weather: boosting 1X2 **+7,71% on 17 bets**, with a negative selection ROI −0,44%; with weather −2,75% at 32 rates. Such a small plus is not chosen in hindsight as a profitable strategy.

## Practical meaning

Suggestion to check weights and additional factors implemented; the conclusion of the first simple test has been clarified. There are slight improvements in the quality of odds and profitable segments on the selection, but a sustainable ROI 20–30% is still not confirmed.

Individual 10–40 bets can easily show tens of percentage points in both directions. There are only five weeks in the next period, four in the weather period; bootstrap intervals are approximate and do not take into account the full risk of choosing the best among hundreds of options. Additional checks during the same months will no longer be a new independent test.

The next meaningful hypothesis is the transfer of the signal to earlier/erroneous prices of a specific bookmaker or one market of players with correctly restored minutes and lineups. Another uncontrolled search on the same results will not provide honest proof of profit. You will need to fix the found strategy in advance and test it on a period that has not yet been studied / quotes collected in advance. This is the recommendation of the next study; Automatic bids were not triggered.

## Evidence and Reproduction

Catalog `specs/work/evidence/WI-003/` contains a complete grid, fixed options, rates for the next period, weather and provenance, information about previous research, checks and `additional_inputs.zip` (**772 047 bytes**). The base image is saved in WI-002; a new copy of its large tables was not created. Additional inputs are listed from SHA-256 to `input_manifest.json`.

```powershell
Expand-Archive -LiteralPath specs/work/evidence/WI-002/inputs.zip -DestinationPath .tmp/betting-research-20260907 -Force
Expand-Archive -LiteralPath specs/work/evidence/WI-003/additional_inputs.zip -DestinationPath .tmp/betting-features-20260907 -Force
python scripts/research/betting_feature_data.py
python scripts/research/betting_feature_data.py --weather
python scripts/research/betting_feature_models.py
python scripts/research/betting_feature_models.py --weather
python scripts/research/betting_feature_verify.py
```

Weather step reuses saved small JSON, does not download the entire archive again. `verification.json`: 124 independent checks of the weights of the previous window, checking the minimum validation loss of fixed models, the boundaries of the next period, the uniqueness of bets, the payout formula and the CRC/SHA-256 archive.

Local calculations, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, weather network with a maximum of two requests simultaneously. The new temporary directory takes up about **29,5 MB**. Together with the previous ≈20 MB, it was left locally: automatic checking previously blocked the deletion of temporary directories (`blocked by policy`). Weather data for the entire hourly range was processed one response per stream, only strings of match hours were saved to disk. Working research processes have not been abandoned. Production health and resources - `resources.txt`.

There were: four basic options, one form window, a short training sample, no weather. Now: 548 configurations, additional season, windows/weights/calendar/Elo/weather model and separately recorded next period. The product code and production did not change.
