# WI-047: Make franchise comparison charts readable

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Compact, interactive franchise charts support the complete population on desktop and mobile without tangled label leaders or a chart height proportional to group count.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#ui`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#data`

## Scope

- In: chart presentation, searchable names and exact metric values, selection and profile navigation, responsive themes, before/after visual evidence and resource checks.
- Out: formulas, sources, API, collection, calendar semantics, analytical capabilities and production deployment.

## Acceptance

- [x] All groups remain accessible by name; plotted values and axis positions retain the original metrics and missing-data semantics.
- [x] Charts remain compact with 75 groups and work with mouse, keyboard and touch; search and highlight do not fetch data.
- [x] Profiles, dates, leagues, tables, CSV, xFO and freezes remain available.
- [x] Desktop/mobile and light/dark screenshots are inspected, with no page overflow.
- [x] Relevant tests, lint, typecheck and build pass; before/after and bounded resource evidence is recorded.

## Dependencies

- Related: `WI-045`, `WI-046` (completed; preserved).

## Result

Completed locally on 2026-10-04; production remains unchanged. Evidence: [verification](../../evidence/WI-047/verification.json), [visual comparison](../../evidence/WI-047/comparison.png).

- Before: the expanded 75-label scatter plot was 1,923 px tall at 1440 px, used intersecting leader lines and disappeared on mobile. After: a 430 px desktop plot and a responsive mobile plot retain all groups, with searchable names, sorting in either direction, exact values, persistent selection, profile links and CSV. Small ranges receive two-decimal axis ticks and a zero reference line.
- Verified on the same production snapshot (75 groups, 40,429 observations, zero duplicate group or observation keys). API, aggregation formulas, snapshot loader and WI-046 report cache are unchanged. No dependency was added; the obsolete label layout helper and its two retired-contract tests were removed.
- Built-application browser checks pass keyboard selection, search with invariant coordinates, metric ordering, CSV, profiles, xFO/freeze tabs, the virtual group, calendar and league URLs, invalid/empty intervals, missing values and coincident-point selection. Inspected both themes at 320/390/760/1440 px with no page overflow; small-screen axis bounds also pass.
- Full check passes: 1,223 tests passed, two skipped, zero failures; lint zero errors/231 warnings, typecheck and production build pass. Ten additional lint warnings concern Russian-only chart copy, matching the existing section; no localization behavior was changed.
- Twenty-five chart interactions perform zero API reads; collected browser heap changes from 15,030,872 to 15,070,720 bytes (about 39 KiB), with no additional retained DOM nodes. This bounded sample does not establish long-term leak freedom. The existing 972.6 MiB Next cache was preserved; no new runtime cache exists.
- Removed the temporary QA user/session, private browser state and copied snapshot; stopped the test app, browser, HTTP viewer and local database. Canonical data and the existing test database are preserved. No new REVIEW or TECHDEBT.
