# WI-072: Release a reproducible bounded production runtime

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Release a reproducible bounded production runtime. Audit findings: F01, F05, F08, F15, F16, F17, F18, F24, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F01, F05, F08, F15, F16, F17, F18, F24; implementation, meaningful regressions, measured evidence and production verification.
- Out: F02 (excluded by the user), unrelated working-tree changes, weakened quality/identity checks, production load testing and downtime.

## Dependencies

- Related: `WI-066`, `WI-072`.

## Acceptance

- [ ] Revalidate the findings against the current code and production state.
- [ ] Implement every listed F-ID, preserving existing user capabilities and bounded caches.
- [ ] Pass direct regression checks and save before/after evidence.
- [ ] Verify the exact released revision and corresponding production behavior.
- [ ] Record cache, duplicates, memory, review and any real remaining limitation.

## Result

Implementation in progress. New evidence belongs in `specs/work/evidence/WI-072/`; the completed audit evidence is not rewritten.

