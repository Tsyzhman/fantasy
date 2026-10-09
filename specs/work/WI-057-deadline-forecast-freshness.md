# WI-057: Verified forecasts in concise deadline reports

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Deadline reports wait for a shared morning XI refresh, distinguish an unavailable forecast from an old one, and say «вне основы по прогнозу» without an accompanying missing-ALT detail.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#signals`
- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#apply`
- Constraint: `spec://modules/telegram/INFRA-005-deadline-pipeline#delivery`

## Scope

- In: investigate morning production reports, explicit shared XI refresh at 08:10, forecast availability/freshness and fixture checks, concise presentation, regression checks, immutable release and resource verification.
- Out: guessing player mappings, accepting incomplete XI, provider credentials, changes to saved squads, automatic correction/resending of delivered reports, and unrelated statistics/odds pipeline work.

## Acceptance

- [ ] Production evidence identifies why the affected clubs have no accepted forecast and why the message called it old.
- [ ] DATA_REFRESH requests and awaits one bounded XI refresh started after the morning threshold; concurrent campaigns reuse it without duplicate imports or retained player payloads.
- [ ] BUILD_REPORTS cannot overtake a queued/running DATA_REFRESH for the same campaign; abandoned leases recover with fencing and bounded attempts.
- [ ] Missing forecasts are called unavailable; genuinely old forecasts remain old and cannot establish OUT_OF_XI.
- [ ] Forecast coverage is restricted to the player's club and upcoming fixtures of the target round.
- [ ] Valid OUT_OF_XI renders «вне основы по прогнозу» and hides only its missing-ALT presentation detail, retaining other causes, raw findings, roles and grouping.
- [ ] Checks pass, the production revision is verified, and memory/cache/duplicates are inspected before and after release.

## Dependencies

- Related: `WI-056`

## Result

In progress.
