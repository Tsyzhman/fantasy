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

- [ ] The comparison uses Alt inputs and its configured score formula. Blank rounds, missing history, and missing fixture projections are distinct.
- [ ] The column supports sorting, filtering, round selection and table export. Older saved layouts that show `FO Opp.` gain the new column and can hide it.
- [ ] The production EPL pool includes the comparison and the Squad page displays it alongside the other forecasts.

## Result

Pending verification.
