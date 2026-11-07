# WI-101: Show Sports.ru Squad forecasts to hundredths

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The Sports.ru Squad tables show two decimal places for forecast points. The server retains hundredths in the round forecasts and their horizons.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#projection-precision`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: round and horizon scores, display on desktop and touch, the existing squad export, and sequential replacement of old pool snapshots.
- Out: scoring weights, prices, historical scores, and provider feeds.

## Acceptance

- [x] Double rounds sum fixture scores before rounding to hundredths. Horizons add the stored round values.
- [x] Squad forecast cells render two decimal places, including trailing zeroes, and keep unavailable values identifiable.
- [x] The exact production release is healthy and the English Premier League pool publishes scores to hundredths.

## Result

Adapted the precision changes from `58152ce` to the serving release and added fixed-width decimal display. The 174 focused tests, Alt display contract test and both complete release checks passed. The controlled desktop and touch checks displayed `0.30`.

Production `0.3.158` runs `3c07029f302aaf8f083c0b5cbeadaf3ed6c956f8`. Playwright verified all six forecast columns on the requested saved Premier League Squad page, including the visible horizon value `24.70`. Haaland's snapshot FO went from 5.6 to 5.57. The new EPL snapshot holds 666 unique players and 423 next-round FO values with meaningful hundredths. Bootstrap refreshed all 12 scopes. [Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42209912686) · [Deploy](https://github.com/Tsyzhman/fantasy/actions/runs/42211104659)
