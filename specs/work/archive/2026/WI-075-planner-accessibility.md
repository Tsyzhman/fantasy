# WI-075: Preserve planner behavior with mobile analytics and accessible modules

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Preserve planner behavior with mobile analytics and accessible modules. Audit findings: F20, F21, F23, from the completed WI-066 audit of 2026-10-10.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#ui`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/main#root`

## Scope

- In: F20, F21, F23; implementation, meaningful regressions, measured evidence and production verification.
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

F20/F21/F23: selected mobile analytics/explanations/chooser, keyboard resizing and UI/domain decomposition shipped without changing 80 moved functions. True touch 391x844 RR/FFO and chooser verified; production keyboard 190/198/230/222/40/640/190 preserves rows. Draft survives forward/rollback/forward through 0.3.137. JS bytes increased 0.84%; single cold load increased 592 -> 679 ms. Initial test column preference writes were detected and restored with compare-and-set; only own QA session removed.

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
