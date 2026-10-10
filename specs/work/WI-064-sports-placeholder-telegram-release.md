# WI-064: Release readable Sports.ru placeholders in Telegram

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production Telegram report displays imported Sports.ru placeholders as `затычка` while retaining their stable identities, lineup roles and explicit mapping limitations.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: the already verified report-label change, matching contract clarification, version 0.3.131, an immutable clean release, required workflow checks, continuous promotion and production resource/duplicate verification.
- Out: player identity or squad-storage changes, new mappings, report resending, Telegram messages to users and unrelated working-tree changes.

## Acceptance

- [ ] Multiple Sports.ru placeholders render as `затычка`; original IDs, captain/vice-captain roles, ordinary names, mapping reasons and repeat-build uniqueness remain correct.
- [ ] The clean pushed candidate has consistent version 0.3.131 and descends from current main and production; the deployment workflow passes its required checks.
- [ ] The canonical promoter verifies a second web before the traffic switch; public health, web/worker image labels and release manifests agree on the candidate commit.
- [ ] Production web/worker are healthy, delivery/job duplicates are checked, and temporary artifacts, retained releases, cache and memory remain bounded.

## Result

In progress. The local report/import checks already passed (28 tests, lint, type checking and a repeated-build check); production promotion and final evidence are pending.
