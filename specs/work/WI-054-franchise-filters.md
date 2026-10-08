# WI-054: Working franchise date and league filters in production

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Users can visibly select the leagues evaluated in franchise analytics together with an inclusive calendar interval, and production reliably applies the selection to every report section.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#ui`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#api`
- Affected: `spec://modules/franchises/FEAT-005-franchise-analytics#ui`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://common/structure#release-transport`
- Constraint: canonical immutable deployment in `docs/operations/DEPLOYMENT.md`.

## Scope

- In: reproduce production filtering behavior, fix date application, make league selection visible and usable, preserve URL state and all existing report capabilities, check filter isolation and cache bounds, version/push/deploy the checked immutable revision, verify production UI/API and runtime resources.
- Out: scoring or forecast changes, new collection jobs, database resets, unrelated UI redesign.

## Acceptance

- [x] Production date/league behavior is inspected and a failing user flow is reproduced with recorded evidence.
- [x] Dates and selected leagues apply together across report sections, with inclusive Moscow dates, explicit invalid/empty ranges and stable URL/reload behavior.
- [x] League selection is visible beside the date controls and works on desktop/mobile in both themes.
- [x] Filter-specific responses remain isolated in the bounded cache; rapid requests cannot replace a newer report with an older one.
- [ ] Relevant regression checks and required release checks pass; source/version guards pass on the clean pushed revision.
- [ ] Canonical promotion succeeds and production health, web/worker labels and release manifest match the exact release.
- [ ] Authenticated production UI/API checks pass; temporary fixtures are removed and cache, duplicates, memory and extra processes are checked during/after release.

## Result

Production 0.3.120 was inspected with a temporary unprivileged viewer. Direct API and button submission correctly filter September (20,242 squads / 35 rounds) versus the whole season (37,557 squads / 65 rounds). Changing both date controls without submitting produces zero API requests and leaves the old report. The existing league selector is hidden in a closed menu. This pass makes valid date/league changes apply automatically while retaining immediate submit/retry, and exposes the league choices. Recorded reproduction: `.tmp/WI-054-before-api.json`, `.tmp/WI-054-before-ui.log`, `output/playwright/WI-054-before.png`.

Pre-release verification: local `npm run check` passed 1,259 tests with two environment-dependent skips, zero failures, lint with zero errors / 236 existing-style warnings, typecheck and production build. A browser preview bundles the actual client component and proxies the authenticated real production API. It passed automatic date/single/multiple/completed filtering, one request for rapid date edits, invalid-date no-request state, empty intervals, profile/URL/reload restoration, six desktop/mobile/theme layout checks, delayed superseded responses and immediate error retry. Real September samples reconcile 2,250 England squads and 4,134 England/Germany squads. The final two-column mobile filter CSS received an additional layout pass. The cache contract regression preserves four distinct date/league reports and the 24 MiB cap. Before release, franchise source duplicates and active-job duplicates are zero; one temporary verification viewer is retained only until production checks complete. Deployment acceptance remains pending.
