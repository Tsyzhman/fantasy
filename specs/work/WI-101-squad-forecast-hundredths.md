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

- [ ] Double rounds sum fixture scores before rounding to hundredths. Horizons add the stored round values.
- [ ] Squad forecast cells render two decimal places, including trailing zeroes, and keep unavailable values identifiable.
- [ ] The exact production release is healthy and the English Premier League pool publishes scores to hundredths.

## Result

The unshipped precision changes from `58152ce` are the starting point.
