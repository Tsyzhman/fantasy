# WI-073: Align source scopes, quality checks and visible freshness

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Align source scopes, quality checks and visible freshness. Audit findings: F12, F22, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#data`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F12, F22; implementation, meaningful regressions, measured evidence and production verification.
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

Implementation in progress. New evidence belongs in `specs/work/evidence/WI-073/`; the completed audit evidence is not rewritten.

