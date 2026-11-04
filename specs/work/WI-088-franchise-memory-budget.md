# WI-088: Restore bounded franchise refresh on the shared host

- Kind: `fix`
- Canon action: `none`

## Outcome

Franchise refresh completes with verified output within a measured safe memory budget on the current host.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Read-only profiling, source/computation working-set optimization, safe job limits and freshness verification.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [ ] No guard removal without measurement; bounded memory and preserved host headroom; identical domain results; controlled successful refresh and new snapshot; no duplicate collectors.
- [ ] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

In progress.

