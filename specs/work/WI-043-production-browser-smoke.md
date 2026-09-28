# WI-043: Restore the full production browser smoke

- Kind: `fix`
- Canon action: `none`

## Outcome

The complete Production Browser Smoke passes on the current production interface across desktop, tablet and mobile, with explicit coverage of unavailable betting history and reliable KHL refresh assertions.

## Specs

- Governing: `spec://modules/betting/FEAT-001-virtual-league#algorithms`
- Governing: `spec://modules/betting/FEAT-001-virtual-league#ui`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#table`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#cards`
- Governing: `spec://modules/machete/FEAT-003-squad-player-card#root`

## Scope

- In: reproduce the full scheduled smoke failures; align production assertions with the current search interface and canonical insufficient-history behavior; synchronize KHL refresh checks; verify the full workflow and resources; publish the reviewable correction.
- Out: application redesign, betting probabilities or source coverage, production data resets, unrelated worker memory growth, deployment of application code.

## Dependencies

- Related: `WI-042`

## Acceptance

- [ ] Failed and flaky full-suite assertions are reproduced and their causes recorded.
- [ ] Betting smoke verifies all five algorithms and honest unavailable-history results without requiring invented data.
- [ ] Football search and KHL refresh checks follow the current user interface and completed requests.
- [ ] Focused lint/type validation and the complete desktop/tablet/mobile production smoke pass.
- [ ] Cache retention, duplicate records/jobs and runtime memory are checked after the complete smoke.
- [ ] The committed correction and verification evidence are published for review.

## Result

In progress. Baseline full run: https://github.com/Tsyzhman/fantasy/actions/runs/36425268049 on `a05ac190612b2e78112df970f2cc2b44c71cab64`: authentication passed; 23 browser checks passed, four failed, one flaky and 20 expected skips. Betting requires five historical matches even when the first listed fixture has only one; the football journey expects a removed heading; the KHL refresh assertion raced with its background refresh.
