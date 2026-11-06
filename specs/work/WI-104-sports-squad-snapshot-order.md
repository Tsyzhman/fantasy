# WI-104: Restore access to published Sports.ru squads

- Kind: fix
- Canon action: none

## Outcome

Squad status and one-click import use the saved Sports.ru squad when an obsolete retry row shares its kickoff. A newer round still follows the publication gate.

## Specs

- Governing: spec://modules/machete/FEAT-001-global-ranking-strategy#data
- Constraint: spec://common/INFRA-006-continuous-deployment#root

## Scope

- In: snapshot lookup, PostgreSQL regression, and production refresh of eligible Sports.ru squads.
- Out: private pre-deadline squads and edits to user plans.

## Acceptance

- [ ] Reproduce the false unavailable status and confirm both readers return the published squad after the fix.
- [ ] Confirm a later pending round still blocks import of the prior squad.
- [ ] Verify the production release and refresh all active Sports.ru scopes with their normal publication rules.

## Result

Pending.
