# WI-103: Keep Squad FFO current

- Kind: change
- Canon action: direct-edit

## Outcome

Sports.ru Squad shows the latest imported Foontasy forecast for the exact tour on screen and updates it independently of the full player-pool calculation.

## Specs

- Governing: spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round
- Constraint: spec://common/INFRA-006-continuous-deployment#root

## Scope

- In: Sports.ru Squad saved roster, player pool and background FFO refresh.
- Out: Foontasy collection cadence, historical samples, and the other projection models.

## Acceptance

- [x] A missing current-tour forecast is unavailable. Zero survives and older tours, phases, and source variants cannot fill the cell.
- [x] A new import is visible on the next load using the same saved player-pool snapshot, and in an open default pool via its existing status poll.
- [ ] Production checks verify Sven Mijnans and a tour with no matching Foontasy import.

## Verification so far

167 focused unit tests, two PostgreSQL contract tests on all canonical migrations, and typecheck pass. The regression test reuses the same retained rows across imports, verifies zero and the withdrawn player, rejects other source scopes, and checks that an unchanged status revision has no delta.
