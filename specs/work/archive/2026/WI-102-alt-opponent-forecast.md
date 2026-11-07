# WI-102: Compare Alt with a historical opponent adjustment

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Sports.ru Squad shows `Alt Opp.` / `Альт соп.` beside the existing forecasts, with its own selected-round and optional horizon columns.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Dependencies

- Related: WI-101

## Scope

- In: apply the existing historical factors to the Alt fixture projection, carry the comparison through snapshots and the personal scoring overlay, and expose it in the Squad table.
- Out: historical rating weights, base forecasts, team totals, and selection and transfer objectives.

## Acceptance

- [x] The comparison uses Alt inputs and its configured score formula. Blank rounds, missing history, and missing fixture projections are distinct.
- [x] The column supports sorting, filtering, round selection and table export. Older saved layouts that show `FO Opp.` gain the new column and can hide it.
- [x] The production EPL pool includes the comparison and the Squad page displays it alongside the other forecasts.

## Result

Unit checks cover the configured Alt scoring formula, missing data and blanks, round shifting, numeric sorting, the compact DTO, and the saved-column migration. Table filters and export share the same numeric column reader. The isolated browser showed the comparison on desktop and touch. Playwright confirmed the new heading and two-decimal values on the requested saved Premier League Squad page without changing the saved layout.

The EPL snapshot published 211 numeric next-round Alt Opp. forecasts, with meaningful hundredths for 191. Haaland's Alt was 5.44 and Alt Opp. was 5.38. All latest pools have 8,464 distinct player rows and zero duplicates. The refresh queue was empty. [Deploy](https://github.com/Tsyzhman/fantasy/actions/runs/42211104659)
