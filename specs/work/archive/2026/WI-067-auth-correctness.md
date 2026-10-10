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

- [x] Revalidate the findings against the current code and production state.
- [x] Implement every listed F-ID, preserving existing user capabilities and bounded caches.
- [x] Pass direct regression checks and save before/after evidence.
- [x] Verify the exact released revision and corresponding production behavior.
- [x] Record cache, duplicates, memory, review and any real remaining limitation.

## Result

Completed on 2026-10-10. Production 0.3.137, commit `7d3f96ef8b7a6efe6ecf5442e061ea2c06fda980`.

F04/F06/F07: sorted atomic login limits, one-time bootstrap and credential input guards shipped. Isolated concurrent checks: 100 recorded, 5 password checks/95 denied, one bootstrap account; full CI passed. Production old login payload remains accepted (303).

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
