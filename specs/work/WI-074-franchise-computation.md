# WI-074: Bound franchise computation outside the web event loop

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Bound franchise computation outside the web event loop. Audit findings: F19, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F19; implementation, meaningful regressions, measured evidence and production verification.
- Out: F02 (excluded by the user), unrelated working-tree changes, weakened quality/identity checks, production load testing and downtime.

## Dependencies

- Related: `WI-066`, `WI-072`.

## Acceptance

- [x] Revalidate the findings against the current code and production state.
- [x] Implement every listed F-ID, preserving existing user capabilities and bounded caches.
- [ ] Pass direct regression checks and save before/after evidence.
- [ ] Verify the exact released revision and corresponding production behavior.
- [ ] Record cache, duplicates, memory, review and any real remaining limitation.

## Result

Implementation in progress. New evidence belongs in `specs/work/evidence/WI-074/`; the completed audit evidence is not rewritten.

