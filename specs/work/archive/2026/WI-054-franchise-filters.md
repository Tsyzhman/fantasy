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
- [x] Relevant regression checks and required release checks pass; source/version guards pass on the clean pushed revision.
- [x] Canonical promotion succeeds and production health, web/worker labels and release manifest match the exact release.
- [x] Authenticated production UI/API checks pass; temporary fixtures are removed and cache, duplicates, memory and extra processes are checked during/after release.

## Result

Completed 2026-10-08. Evidence: [verification record](../../evidence/WI-054/verification.json). Production changed from 0.3.120 (`ccb3653261a1e16f2d09f1ff7ffeffeaaf499931`) to 0.3.121 (`6e090eced498191fe80671c751c897dd73bff1ca`). [PR #40](https://github.com/Tsyzhman/fantasy/pull/40) merged as `37794b8e31a3a0b4c12d471d35010775532a029e`; its tree is identical to the deployed candidate tree `286f4b97b931dee9fd13b0cb9bef502de70f1d00`.

Before, changing dates without pressing the submit button produced no request and left the report unchanged; direct API and explicit button submission already worked. The league selector was hidden in a closed menu. Now valid dates, league choices and completed-round changes apply automatically after 350 ms, with immediate submit/retry retained. All league choices are visible, quick single-league selection and multi-league checkboxes work, and the last league cannot be silently cleared. Invalid/incomplete dates hide stale reports and issue no request. Superseded timers and requests are cancelled. Profile selection and applied filters survive URL sharing and reload.

Local `npm run check` passed 1,259 tests with two environment-dependent skips, zero failures, lint with zero errors / 236 warnings, typecheck and build. Candidate [Check 37728507281](https://github.com/Tsyzhman/fantasy/actions/runs/37728507281) passed all 1,261 tests with zero skips, 20 isolated database tests, production dependency audit, lint, typecheck and production build. [Main Check 37729438898](https://github.com/Tsyzhman/fantasy/actions/runs/37729438898) also passed after merge. The clean pushed source/version guards passed. The cache regression preserves distinct date/league populations and empty ranges within the existing four-entry / 24 MiB cap.

Canonical [Deploy 37728525965](https://github.com/Tsyzhman/fantasy/actions/runs/37728525965) passed canary and guarded promotion. Active release is `/var/www/fantasy-scout-releases/20261008T044407Z-v0.3.121-6e090ec`. Health, web/worker container and image labels, image IDs and release manifests match. No schema migration, data reset or VPN change was introduced.

Authenticated real production API/UI checks passed automatic combined filters, completion changes, rapid edits coalesced into one request, empty/invalid dates, URL/reload/profile restoration, immediate retry, superseded-response exclusion and both themes at 320/390/1440 px without page overflow. September reconciles 20,242 squads overall, 2,250 England squads and 4,134 England/Germany squads; the empty June interval remains zero. Anonymous access is 401 and five invalid filter cases are 400. Snapshot integrity and unique observations/rounds passed. [Production browser 37729254481](https://github.com/Tsyzhman/fantasy/actions/runs/37729254481) passed authentication and 28 desktop/tablet/mobile checks, with 20 production-inapplicable skips, zero failures/retries.

The temporary viewer, sessions and automatically created virtual betting account/ledger were removed after identity and no-bet checks. Before, during and after promotion, franchise source and snapshot duplicates were zero; raw cache held 749 rows / 10,790,599 bytes with zero expired rows, and active-job duplicates were zero. At 04:54:49 UTC containers were healthy with zero restarts/OOM, zero canaries, two release directories, no extra refresh child and no active franchise collector. Web used 1.176 GiB, worker 1.027 GiB and PostgreSQL 1.036 GiB; available host memory was 5,890 MiB. Franchise source-cache sizes stayed unchanged during report requests. Docker cache reports 1.062 GB private and 16.14 GB image-shared layers, totaling 17.2 GB; it is not described as a 1 GB total. These are bounded-request/runtime samples, not proof about long-term leaks.

The spec-space snapshot is current with zero diagnostics and fingerprint `957c3916689638b24cee53e142751c1e71376cf3466426068e76a4f932422a3e`. Canon/UI changelog updated; module ownership unchanged. No new REVIEW or TECHDEBT. Final operational result/BOARD/evidence bookkeeping is saved locally after the immutable deployed commit.

The browser and local preview process were closed, and private QA/browser-state files were removed. Automatic approval review rejected the subsequent recursive cleanup of ignored `.tmp/WI-054-*` helper/log/preview artifacts with `blocked by policy`. That deletion was not retried; the non-secret local artifacts remain. Production deployment and database-fixture cleanup are complete.
