# WI-089: Sort player columns directly on mobile

- Kind: `feature`
- Canon action: `direct-edit`

## Outcome

Users can choose a player metric and reverse its sort direction on a phone without switching to desktop layout or losing their squad/filter state.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Constraint: `spec://common/PROP-002-editorial-sport-design#contracts`
- Related: `spec://modules/khl/FEAT-002-khl-squad#table`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: visible mobile player-pool column/metric sorting, direction and active state; existing sort arithmetic and pagination; verify KHL mobile sorting and fix a demonstrated equivalent gap if present.
- Out: changes to metrics/formulas, removal of mobile cards or existing controls, unrelated redesign, production squad mutations.

## Acceptance

- [x] Mobile sorting is discoverable before browsing players and covers the supported fixed and selected analytical columns; unavailable/non-sortable columns are not offered as working sorts.
- [x] Column selection and ascending/descending control change the entire filtered pool before pagination, preserve numeric/position/null/tie semantics and keep active key/direction visible.
- [x] Sorting preserves current squad, filters and selected columns; mobile pagination resets appropriately; desktop sorting remains compatible.
- [x] Actual touch/browser checks at 320/390px cover a numerical metric, nulls, both directions and adding a player after sort; desktop regressions and KHL mobile behavior are recorded.

## Dependencies

- Related: WI-084, WI-086

## Result

Implementation verified locally: 70 unit/contract tests, six browser scenarios passing with six intentional viewport skips, zero lint errors and passing root typecheck. Controls sort the whole filtered pool, preserve null-last/stable ties, reset mobile pagination, share desktop state, and preserve squad/filters. Independent review corrected both a missing-column display mismatch and restoration of an explicitly cleared sort. Evidence: `evidence/WI-089/`; existing KHL mobile sorting was verified live in `evidence/WI-084/khl-mobile-sort-before-release.json`.

Added by the user while 0.3.149 was in CI. Deployment run 41809561461 was cancelled before packaging/promotion. The revised candidate passed complete CI and production verification through WI-084.

Resource handoff: fixture Node/Playwright Edge processes remaining = 0; 12 retained browser artifacts total 304,756 bytes; test-runner output is 45 bytes. No new dependencies, persistent caches or cleanup deletions. Details: `../../evidence/WI-089/resources-after.json`. The immutable before probe confirms zero touch sort controls at both 320/390px; final screenshots and checks are retained.


Root production acceptance, 2026-11-04: canonical Deploy [41819445507](https://github.com/Tsyzhman/fantasy/actions/runs/41819445507) successfully released 0.3.149 / `269980b7bbc8d16c850aad89229423f5a2383346` after fresh complete CI. Public health, release markers and web/worker OCI labels agree; Node 24.22.2 verified. Across promotion, 611 public probes had zero errors and 20 consecutive new-revision probes retained old assets. [Release identity](../../evidence/WI-084/release-identity-0149.json), [availability](../../evidence/WI-084/release-availability-summary.json), [CI result](../../evidence/WI-090/ci-validation-summary.json).

Actual production at 390/320 px: price descending 11/11/10/9.5 then ascending 4; forecast descending 6.6/6.6/6.5 then ascending 0. No document overflow and no squad writes. [Live evidence](../../evidence/WI-089/production-sorting.json) and before/after JPEGs retained.
