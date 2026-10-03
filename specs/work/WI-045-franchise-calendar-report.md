# WI-045: Complete franchise report histories and calendar filtering

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production franchise report compares managers across all of their available rounds in a shared calendar interval, includes all 74 franchises supplied in `шизы.xlsx`, and treats the second-sheet users as a virtual group named `шизы`.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: complete manager histories, date filters and their URL/API validation, franchise source registry and virtual `шизы` group, bounded collection/publication, regression checks, Git push and immutable production deployment.
- Out: changes to football scoring or forecasting models, fictitious starting/reserve/freeze states for the virtual group, unrelated server applications.

## Acceptance

- [ ] Personal comparisons include managers' reserve and frozen rounds, with regression evidence and reconciled source counts.
- [ ] Inclusive Moscow calendar dates filter all sections and denominators consistently across leagues; invalid and empty intervals are explicit.
- [ ] All 74 unique workbook franchise IDs are registered and collected; missing source data is reported without fabricated values.
- [ ] All second-sheet users form one `шизы` group with personal histories and no franchise lineup or freeze semantics.
- [ ] Existing navigation, profiles, league selection, themes, tables and CSV remain functional.
- [ ] Relevant tests and full release checks pass; source is committed and pushed to GitHub.
- [ ] Production web/worker revision and release manifest match the release; authenticated API/UI smoke passes.
- [ ] Source/snapshot duplicates, collection locks, temporary artifacts, bounded cache and memory are checked during and after collection/deployment.

## Dependencies

- Related: `WI-028`, `WI-029`

## Result

Implementation is complete; collection and production verification are in progress.

- Personal manager comparisons include reserve/frozen rounds and supported personal leagues outside the franchise entry. Regular franchise tournament samples keep their existing scope.
- Calendar bounds use inclusive Moscow dates of the first fixture; one round remains one observation. The 74 unique workbook franchise IDs and 24 second-sheet profiles are stored in the source registry; the latter form the virtual `шизы` group.
- Full `npm run check` passed: 1,218 tests, 1,216 passed, two platform skips, zero failures; lint has zero errors (221 existing warnings), typecheck and production build passed. The subsequent missing-lineup regression passed with all 13 focused franchise tests. Python collection checks passed all 15 tests, including the 107-case xFO fixture.
- Spec-space snapshot is `current`, diagnostics empty, fingerprint `89195af27c8c96833453f1d4e30f5a66513fb1b19eee5ba7ef2b737b9fbb04d6`; provenance records the working tree based on `ceb6c92550779cbc9cf367b4ae2040911d20c53b`.
- Local collection reuses canonical finished source files and atomic HTTP cache entries. Production's previous ready snapshot remains available while the expanded snapshot is prepared.
