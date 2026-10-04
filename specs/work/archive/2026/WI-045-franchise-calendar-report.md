# WI-045: Complete franchise report histories and calendar filtering

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production franchise report compares managers across all of their available rounds in a shared calendar interval, includes all 74 franchises supplied in `шизы.xlsx`, and treats the second-sheet users as a virtual group named `шизы`.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#ui`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: complete manager histories, date filters and their URL/API validation, franchise source registry and virtual `шизы` group, readable graph labels for the expanded registry, bounded collection/publication, regression checks, patching existing dependency audit findings blocking release, Git push and immutable production deployment.
- Out: changes to football scoring or forecasting models, fictitious starting/reserve/freeze states for the virtual group, unrelated server applications.

## Acceptance

- [x] Personal comparisons include managers' reserve and frozen rounds, with regression evidence and reconciled source counts.
- [x] Inclusive Moscow calendar dates filter all sections and denominators consistently across leagues; invalid and empty intervals are explicit.
- [x] All 74 unique workbook franchise IDs are registered and collected; missing source data is reported without fabricated values.
- [x] All second-sheet users form one `шизы` group with personal histories and no franchise lineup or freeze semantics.
- [x] Existing navigation, profiles, league selection, themes, tables and CSV remain functional.
- [x] Relevant tests and full release checks pass; source is committed and pushed to GitHub.
- [x] Production web/worker revision and release manifest match the release; authenticated API/UI smoke passes.
- [x] Source/snapshot duplicates, collection locks, temporary artifacts, bounded cache and memory are checked during and after collection/deployment.

## Dependencies

- Related: `WI-028`, `WI-029`

## Result

Completed and verified in production on 2026-10-04. Evidence: [verification record](../../evidence/WI-045-franchise-calendar-report.json). Git: [PR #35](https://github.com/Tsyzhman/fantasy/pull/35).

- Before, personal comparisons omitted reserve/frozen rounds and teams outside franchise boards. Now all supported personal histories are collected, including former board participants without an H2H profile. The production example Fanton Maestro reconciles 45 rounds: 3 active, 41 reserve and 1 personal round outside the franchise entry. Regular franchise tournament samples retain their own scope.
- Before, round-number bounds compared different calendar periods across leagues. Now inclusive Moscow dates of the first fixture filter a whole round consistently. September 2026 includes RPL rounds 7–9 and Bundesliga rounds 2–4. Five invalid filter cases return 400; an empty interval returns zero observations and preserves all 75 selector groups.
- Before, the registry contained 12 franchises. Now it contains all 74 unique workbook franchises plus the virtual `шизы` group with 24 users and 1,551 personal observations. Collection reconciles 40,078 canonical source lineups, 40,429 group observations and 812 manager/group entries. All 157 unavailable lineups remain explicit without fabricated scores. Source, observation and selection duplicates, missing board states and future-history violations are zero.
- The virtual group exposes personal metrics without starting/reserve/freeze states. Browser checks passed profile navigation, league selection, table search/sorting, 24-row CSV, date validation, both themes and widths 320/390/760/1440 without page overflow. Expanded graph labels no longer collide or shrink to unreadable text: all 75 labels are present, overlap count is zero and rendered label height is 22 px on the final release.
- Final [GitHub Check](https://github.com/Tsyzhman/fantasy/actions/runs/37155081937) passed all 1,222 project tests and 15 database integration tests, with zero failures. The Python collection suite passed 19 tests, including the 107-case xFO fixture. Lint reports zero errors and 221 existing warnings; typecheck and production build passed. Next.js/eslint-config-next 16.3.8 and the brace-expansion adapter/upstream 5.0.12 remove the dependency audit findings that blocked release; production audit reports zero vulnerabilities, and cross-platform optional dependencies remain reproducible on Linux.
- Release `0.3.113`, commit `8ca6dd2a0908ddb072adc6cc8cc520af525d2d3b`, tree `7e0bfc1bcdae3e33311f7cae8b7962cf953328da` was pushed and [deployed successfully](https://github.com/Tsyzhman/fantasy/actions/runs/37155080819). The immutable release manifest, healthy web/worker container labels and health API match this revision, with zero restarts. Authenticated API/UI verification passed; anonymous access returns 401. The scheduled refresh subsequently published a valid v2 snapshot at `2026-10-04T15:59:37.992900+00:00`; its file digest matches the database record, and canonical database duplicates and mismatched source IDs remain zero.
- Memory was measured during collection, import and final operation. The snapshot load/aggregation probe passed a 384 MiB heap; the scheduled importer uses a bounded 768 MiB heap and imports in batches. Final worker memory is 2.449 GiB with about 5.2 GiB available on the host. HTTP cache has a 30-minute TTL and 30-day retention; canonical finished sources are reused. The collector timer is active, the shared lock is free and no collection/import lock files remain.
- Temporary QA users, sessions and their automatically created virtual betting accounts were deleted after verification; the browser and private state files are closed/removed. Local collection, source-check, lockfile-check and upload artifacts totaling about 600 MiB were removed. The remote upload was removed; one previous ready snapshot remains for rollback. Other applications were untouched.
- Spec-space receipt is `current`, diagnostics empty, fingerprint `841904b534a338ef3f899a717007ea9909d1c6804f92d89305a69166643286b1`, with clean Git provenance at the deployed commit. The owning specification and changelog are current; no new REVIEW or TECHDEBT remains.
