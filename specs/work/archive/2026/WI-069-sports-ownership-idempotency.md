# WI-069: Publish one complete Sports ownership snapshot

- Kind: `fix`
- Canon action: `none`

## Outcome

Publish one complete Sports ownership snapshot. Audit findings: F14, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://modules/machete/FEAT-006-sports-popularity#data`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F14; implementation, meaningful regressions, measured evidence and production verification.
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

F14: transactional ownership publication and source/section uniqueness shipped. Concurrent/repeated isolated publication produces one complete snapshot. Live duplicate buckets and incomplete latest snapshots are both zero.

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
