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
- [x] Pass direct regression checks and save before/after evidence.
- [x] Verify the exact released revision and corresponding production behavior.
- [x] Record cache, duplicates, memory, review and any real remaining limitation.

## Result

Completed on 2026-10-10. Production 0.3.137, commit `7d3f96ef8b7a6efe6ecf5442e061ea2c06fda980`.

F19: exact rank indexing and bounded report computation/cache outside main web event loop shipped. Synthetic 3000 ranks 580.48 -> 3.62 ms with equality; main-loop max 319.24 -> 19.87 ms. Real 9112642-byte report SHA256 identical; cold 2587 -> 5350 ms (slower), warm 858 ms; sampled web peak 878776320 B. Cold regression is reported, not concealed.

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
