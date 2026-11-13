# WI-094 — Massey team strength by league

- Kind: `change`
- Canon action: `new-spec`

## Outcome

League visitors can compare team strength, raw xG difference and the difficulty of the matches played in the selected season.

## Specs

- Governing: `spec://modules/machete/FEAT-015-league-strength#root`
- Constraint: `spec://common/PROP-002-editorial-sport-design#contracts`
- Affected: `spec://modules/machete/FEAT-015-league-strength#root`

## Scope

- In: a league-season table, regularized Massey fit and coverage information from existing football data.
- Out: forecasting points, changing Squad calculations, schema changes and production rollout.

## Acceptance

- [x] Verify opponent and venue adjustments, early-season data and missing xG.
- [x] Verify league-season navigation and the table with representative results.
- [x] Verify limits on input rows, unique fixtures and temporary memory.

## Result

Machete opens the Massey table from the selected league and season. It shows strength, raw xG rank and played schedule rank with paired xG coverage. The initial model gives goal difference and xG difference equal weights and fits home advantage. It uses the final score when paired xG is unavailable.

The PostgreSQL and browser checks used 18 clubs and 72 unique Bundesliga matches from the first eight rounds of 2026/27, all with paired xG. Freiburg was third by Massey and fifth by raw xG difference. An isolated prior-season fixture had `0/1` paired xG coverage. Ineligible and cross-season fixtures and a foreign team-stat row did not affect the result. At 360 px the table scrolled within the page. The reader rejected 129 clubs and 4097 matches in a rolled-back transaction.

The test suite passed 1390 tests with four skips. Type checking and the production build passed. Lint reported zero errors. A local replay of 100 calculations at the 128-club and 4096-match limit averaged 1.52 ms for the calculation. A combined replay with 50 pass-file imports retained 13.23 MiB of JS heap after GC, from 13.09 MiB after warm-up. The sample verifies the feature and its input bounds. Predictive accuracy needs a separate evaluation.
