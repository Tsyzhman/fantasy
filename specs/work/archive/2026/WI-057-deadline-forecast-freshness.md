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

- [x] Production evidence identifies why the affected clubs have no accepted forecast and why the message called it old.
- [x] DATA_REFRESH requests and awaits one bounded XI refresh started after the morning threshold; concurrent campaigns reuse it without duplicate imports or retained player payloads.
- [x] BUILD_REPORTS cannot overtake a queued/running DATA_REFRESH for the same campaign; abandoned leases recover with fencing and bounded attempts.
- [x] Missing forecasts are called unavailable; genuinely old forecasts remain old and cannot establish OUT_OF_XI.
- [x] Forecast coverage is restricted to the player's club and upcoming fixtures of the target round.
- [x] Valid OUT_OF_XI renders «вне основы по прогнозу» and hides only its missing-ALT presentation detail, retaining other causes, raw findings, roles and grouping.
- [x] Checks pass, the production revision is verified, and memory/cache/duplicates are inspected before and after release.

## Dependencies

- Related: `WI-056`

## Result

Released 0.3.124 as `20261009T081446Z-v0.3.124-a6cfbf0`, source `a6cfbf0fc22adc3d67c8478b16a2959ac9bda4c4`, tree `563ee59e564a6dc617a53b6969bb671c1bfd5b90`. PR #43 merged as `3bd8766098220cce19a8cc391df6d4d95a3eede8`. Public health, current manifests and both web/worker image revisions agree.

Focused regressions: 25 passed. Candidate Check 37902728836: 1,276 unit/contract tests and 23 database tests, audit, lint, types and production build passed. Deploy 37903299525 passed guarded promotion. Workflow/version validation and current spec snapshot passed.

The morning pipeline omitted XI refresh; missing accepted metadata was incorrectly labelled old. Source evidence separately identifies name/roster blockers in Barcelona, Groningen and Dynamo Makhachkala. The user's subsequent request to repair that ingestion is tracked by WI-058.

Post-release: all containers healthy, no OOM/restarts, worker 1.091 GiB, available host memory 6,568 MiB. Ten previously sent Telegram messages remain; no extra sends or duplicate delivery keys/message IDs. Raw cache has 911 rows, 13,177,981 bytes and zero expired rows (normal concurrent KHL collection). Evidence: `specs/work/evidence/WI-057/`. No new migration, squad change or VPN rotation. No REVIEW or TECHDEBT added.
