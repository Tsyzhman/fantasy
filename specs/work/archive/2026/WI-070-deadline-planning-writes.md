# WI-070: Stop unchanged deadline campaign writes

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Stop unchanged deadline campaign writes. Audit findings: F09, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F09; implementation, meaningful regressions, measured evidence and production verification.
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

F09: dirty planning and no-op suppression shipped. Comparable 30-minute production campaign updates fell from 8320 to 4 and stage updates from 21967 to 9. Final 32-minute window includes real source changes: 6/18 updates; duplicates zero. No active campaign or delivery was removed to obtain these results.

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
