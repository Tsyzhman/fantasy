# WI-086: Preserve table controls and modal keyboard focus

- Kind: `fix`
- Canon action: `none`

## Outcome

Keyboard users can activate native table controls and operate touch-action dialogs without losing focus.

## Specs

- Governing: `spec://common/PROP-002-editorial-sport-design#root`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: SortableTable event handling and planner touch action dialog; preserve current layouts and all analytical controls.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [ ] Enter/Space activate body buttons/inputs; sortable headers and keyboard resize still work; dialog traps Tab, closes Escape and restores focus; responsive visual checks.
- [ ] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

In progress.

