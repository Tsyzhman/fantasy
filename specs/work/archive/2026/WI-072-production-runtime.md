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

- Related: `WI-066`.

## Acceptance

- [x] Revalidate the findings against the current code and production state.
- [x] Implement every listed F-ID, preserving existing user capabilities and bounded caches.
- [x] Pass direct regression checks and save before/after evidence.
- [x] Verify the exact released revision and corresponding production behavior.
- [x] Record cache, duplicates, memory, review and any real remaining limitation.

## Result

Completed on 2026-10-10. Production 0.3.137, commit `7d3f96ef8b7a6efe6ecf5442e061ea2c06fda980`.

F01/F05/F08/F15/F16/F17/F18/F24: limited runtime roles, Node 24.21.0, resource budgets/shared process Prisma pool, stable actions/drafts, CI image delivery, domain canary, correlated bounded diagnostics/rolling SLO and runbooks/session retention shipped. Exact version/OCI binding verified; 32 minutes 7 seconds, 386/386 health 200, new OOM/restarts zero. 61 migrations/five ready indexes; old artifact key incident recovered and documented. Final ordinary KHL processing respected budgets but domain result was PARTIAL, not success. Server cleanup complete; ignored local cache/private revoked-QA files retained after automatic deletion rejection. F02 remains excluded.

Evidence: [23-finding report](../../evidence/WI-072/report.ru.md), [final verification](../../evidence/WI-072/final-verification.json), [observation](../../evidence/WI-072/observation-summary.json), [cleanup](../../evidence/WI-072/cleanup-result.json). Check run 38057195514 and Deploy run 38057193543 succeeded. Other work items and the completed WI-066 audit are preserved.
