# WI-087: Patch Node runtime and enforce release validation

- Kind: `fix`
- Canon action: `none`

## Outcome

Production runtime receives current Node 24 security patches and deployment validates the exact source before promotion.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Node image/runtime pins, required exact-revision checks; investigate trusted SSH host key provisioning.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [ ] Verified official image digest; supported patch at CI/runtime; audit, unit/DB/migration checks gate exact deployment; continuity and rollback contracts preserved.
- [ ] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

In progress.

