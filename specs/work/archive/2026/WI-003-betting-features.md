# WI-003: Advanced betting factor check

- Kind: `research`
- Canon action: `none`

## Outcome

Refine the output of WI-002 after researching different weights, time windows, calendar, market calibration and available weather forecast history.

## Specs

Betting owning spec is missing. Context: `specs/common/main.md`, `docs/research/BETTING_FEASIBILITY_2026-09-07.md`, `src/machete/formula_adaptations.ts`.

## Scope

- In: search for existing research; limited expansion of the sports dataset; chronological optimization of weights and comparison of factors; weather data at confirmed times; reproducible report.
- Out: production changes, real rates, promise of ROI, use of future results as a sign.

## Acceptance

- [x] It is recorded which previous studies were found and what of them was used.
- [x] Various weights/windows and calendar factors were tested, compared with the market baseline.
- [x] Weather availability checked; historical forecasts are separated from actual observations.
- [x] All tested options, validation/test results, restrictions and resource control have been saved.

## Dependencies

- Related: WI-002.

## Result

Completed 2026-09-07. Report: `docs/research/BETTING_FEATURE_RESEARCH_2026-09-07.md`, evidence `specs/work/evidence/WI-003/`.

Found exported formulas and hypotheses of the previous FotMob/H2H research; the source archive and research Python scripts were not found in the checked locations. Feature ideas, not final weights, have been transferred from the future period. 548 configurations: according to 259 basic and according to 15 weather for two markets. Windows 3/5/10/20, xG/goals 0/25/50/75/100%, calendar, Elo, home/away kit, market mixes, logistic and boosting. Training/recruitment/next period data 4890/1838/220; next period 2026-08-07…2026-09-03.

Market boosting on selection +8,90% ROI outcomes / +8,11% totals; next period −56,82% at 11 / −8,46% at 13 rates. There is no sufficient sample for sustainability. Weather: 1932 historical forecast-day1, 49 English teams; suitable strings 1316/460/54. Weather boosting totals +13,25% on selection, −23,73% on 11 on the following bets. The weather regression of totals is +1,97% on 37 for the following bets, the interval is −27,13…+25,53%. Target 20–30% is not confirmed.

Checks: 124 independent checks of lagged EWM, selection of models by validation loss, frozen thresholds, absence of duplicate rates and correctness of payments/period boundaries, previous day of weather forecast, CRC/SHA-256 input archive. Archive of new inputs 772047 bytes, underlying large tables were not re-archived.

Production is not changed, services are healthy, 6236 MiB RAM is available. The calculation is local and single-threaded, the weather has a maximum of two requests at the same time, there are no research processes left. The cache of the new pass 29465873 bytes is left: previously automatic review prohibited deletion (`blocked by policy`); this is clearly indicated to the person. REVIEW: small next period, approximate stadium coordinates 2023/24, incomplete old season calendars, original old archive not found. The canon did not change, WAL was not required.
