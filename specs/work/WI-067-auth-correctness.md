# WI-067: Atomic sign-in limits and one-time bootstrap

- Kind: `change`
- Canon action: `new-spec`

## Outcome

Atomic sign-in limits and one-time bootstrap. Audit findings: F04, F06, F07, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://common/main#root`
- Governing: `spec://common/FEAT-009-session-authentication#root`
- Affected: `spec://common/FEAT-009-session-authentication#root`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F04, F06, F07; implementation, meaningful regressions, measured evidence and production verification.
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

Implementation in progress. New evidence belongs in `specs/work/evidence/WI-067/`; the completed audit evidence is not rewritten.

