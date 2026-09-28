# WI-043: Restore the full production browser smoke

- Kind: `fix`
- Canon action: `none`

## Outcome

The complete Production Browser Smoke passes on the current production interface across desktop, tablet and mobile, with explicit coverage of unavailable betting history and reliable KHL refresh assertions.

## Specs

- Governing: `spec://modules/betting/FEAT-001-virtual-league#algorithms`
- Governing: `spec://modules/betting/FEAT-001-virtual-league#ui`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#table`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#cards`
- Governing: `spec://modules/machete/FEAT-003-squad-player-card#root`

## Scope

- In: reproduce the full scheduled smoke failures; align production assertions with the current search interface and canonical insufficient-history behavior; synchronize KHL refresh checks; verify the full workflow and resources; publish the reviewable correction.
- Out: application redesign, betting probabilities or source coverage, production data resets, unrelated worker memory growth, deployment of application code.

## Dependencies

- Related: `WI-042`

## Acceptance

- [x] Failed and flaky full-suite assertions are reproduced and their causes recorded.
- [x] Betting smoke verifies all five algorithms and honest unavailable-history results without requiring invented data.
- [x] Football search and KHL refresh checks follow the current user interface and completed requests.
- [x] Focused lint/type validation and the complete desktop/tablet/mobile production smoke pass without failed or flaky checks.
- [x] Cache retention, duplicate records/jobs and runtime memory are checked after the complete smoke.
- [x] The committed correction and verification evidence are published for review.

## Result

The original five-minute alert compared season coverage with a five-game player card and had already been corrected in WI-042. Re-running the complete scheduled scope exposed further failures: insufficient history was treated as a failed betting model, the football journey expected a removed heading, and KHL refreshes could cross a catalog revision. Betting now verifies all five assessments, bounded available probabilities and explicit SKIP/null reasons. Search checks the current heading, populated search and the forecast player's action. KHL retries only the exact revision conflict, waits for forecast publication immediately before opening the card, and compares its coverage/formula with the actual refreshed catalog payload. Response listeners are removed in a finally block.

Verification:

- Baseline [36425268049](https://github.com/Tsyzhman/fantasy/actions/runs/36425268049): authentication passed; 23 browser checks passed, four failed, one flaky, 20 expected skips.
- Intermediate [36427238165](https://github.com/Tsyzhman/fantasy/actions/runs/36427238165): 27 passed, one flaky mobile forecast check, 20 expected skips. This result prompted the forecast snapshot correction.
- Final [Production Browser Smoke 36428805307](https://github.com/Tsyzhman/fantasy/actions/runs/36428805307) on `7317adec65240c609c5a33eb458bee3530da11ae`: authentication passed; all 28 applicable desktop/tablet/mobile checks passed, zero failures, zero flaky checks or test retries, 20 existing local-data/desktop-only skips. Full scope: 48 tests, 4.9 minutes.
- [Check 36428799876](https://github.com/Tsyzhman/fantasy/actions/runs/36428799876): 1210 unit tests and 15 isolated database tests passed; lint has zero errors and 215 existing warnings; typecheck/build pass; production dependency audit has zero vulnerabilities. Focused local ESLint, TypeScript and release-version verification also pass.

Post-smoke production verification found one reused KHL QA draft and zero duplicate squad entries, raw groups, player-match facts or active jobs. Web and worker are healthy with zero restarts; memory snapshots: web 665.6 MiB, worker 2.145 GiB, PostgreSQL 1.407 GiB, host available 5332 MiB. Raw KHL cache is 2282199 bytes; reclaimable Docker build cache is 970.3 MB, with the current release and one rollback retained. These are resource snapshots, not a claim that unrelated worker memory growth was repaired.

No local repository test/browser process remains. Existing Next output is 1651521597 bytes. Automatic approval review rejected deletion of approximately 22.3 MiB of this task's diagnostic artifacts with `blocked by policy`; they are retained, with no bypass attempted.

Published through [PR #33](https://github.com/Tsyzhman/fantasy/pull/33), version 0.3.108. Specification snapshot is current with no diagnostics, fingerprint `e0802bac53472b251b493762fde55e263b66c0057593b7fb69abd4a87141d0f9`. Sanitized evidence: [verification.json](../../evidence/WI-043/verification.json). No new REVIEW or TECHDEBT was introduced.
