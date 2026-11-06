# Production release history

## Latest verified release 0.3.158 — 2026-11-06

[Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42209912686) and [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42211104659) passed for `3c07029f302aaf8f083c0b5cbeadaf3ed6c956f8`. Production runs `20261106T113902Z-v0.3.158-3c07029`. Sports.ru Squad retains and displays hundredths and adds Alt Opp. alongside FO Opp. The authenticated saved Premier League page rendered both comparisons with two decimal places. The worker published version-3 pools for all 12 scopes and 8,464 players, with zero duplicates and an empty refresh queue.

All 148 public health probes succeeded, including 20 on the promoted commit. The previous CSS returned HTTP 200 with its original checksum. The Caddy and PostgreSQL process identities matched the pre-release measurements. One healthy web, worker and relay serve the new release. The previous release is retained for rollback. The worker used 1.259 GiB after bootstrap within its 4 GiB limit. [WI-101](../../specs/work/archive/2026/WI-101-squad-forecast-hundredths.md) · [WI-102](../../specs/work/archive/2026/WI-102-alt-opponent-forecast.md)

## 0.3.157 — 2026-11-06

[Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42202407578) and [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42203880768) passed for `a743a1dcd8929b48809192567fbabcfb68569fed`, tree `bc7cbaa1ee2522061268e8362e896a39ba8bb2a8`. Production runs `20261106T104343Z-v0.3.157-a743a1d`. The Baltika workspace and its API were removed, the retired forecast endpoint returns 410, and all three Squad canaries passed.

Dry run took 10m39s and the live workflow took 20m06s. The artifact shrank from 816.1 MB to 754.3 MB and delivery fell from 6m50s to 5m23s. The release directory shrank from 54.7 MB to 26.4 MB.

All 263 public health and previous-CSS probe pairs passed, including 31 after the switch. One healthy worker and the 0.3.155 rollback release remain. The queue and duplicate checks returned zero. One closed 249.8 MB partial from a failed prior run was removed. [WI-100](../../specs/work/archive/2026/WI-100-production-revamp.md) records the verification.

## 0.3.155 — 2026-11-06

[Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42182014622) and [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42183333553) passed for `ac22b542dc9ffa2b4908cda6fcf7347d26ecad09`, tree `575e718845c1b545b810835093b82ab17146d631`. The running release is `20261106T075530Z-v0.3.155-ac22b54`. Public health, release marker and both running images agree. CI passed the full Check on the pinned Ubuntu 24.04 runner.

Eight manually reviewed SorareInside bindings now publish with the matching active players despite the recorded date discrepancies. The last played match supplied 23 XIs for unavailable forecasts, including Lillestrøm. Three scopes retained their prior flags because the full played XI was absent from the active roster. Production verified the 31 accepted starter sets against their Squad cache revisions.

All 227 health and prior-CSS probes passed. The queue and duplicate checks returned zero. One worker, three READY revisions per scope and two releases remain. The worker settled at 1.13 GiB of 4 GiB, with zero restarts or OOM. The verified archive was consumed. Details are in [WI-097](../../specs/work/archive/2026/WI-097-sorare-last-played-xi.md).

## 0.3.153 — 2026-11-05

[Deploy Production 42009437469](https://github.com/Tsyzhman/fantasy/actions/runs/42009437469) and its [dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42007646881) passed for `3d9a9b213db73b92bb8a3ef47b1a228d5687c4cb`. The recorded release is `20261105T102538Z-v0.3.153-3d9a9b2`. Public and loopback health, the release manifest and both running image labels agree. CI passed 1,387 main tests and 48 browser scenarios, and the production Squad page and both pool routes passed the authenticated canary.

Sports.ru FO gives marked outfield starters at least 55 event minutes in the nearest fixture. Recognized lower-division attacking histories use the calibrated league-pair factors. Squad adds FO Opp. as a comparison using the defense of past opponents. The new worker published version-2 pools for all 12 active scopes with 8,464 players. In the nearest round, FO Opp. has a numeric result for 4,027 players, including 419 whose value differs from FO. The 3- and 5-round model finished its first recalculation for all 12 scopes.

All 404 public health and old-CSS probes passed, including 20 consecutive probes after switching to the new commit. Caddy and PostgreSQL retained their processes. One interrupted artifact upload resumed and passed complete SHA-256 verification on both ends. Cleanup removed the temporary archive, retained 0.3.152 for rollback and left one verified database dump. The pool queue drained, with three READY revisions per scope and zero duplicate player, forecast, job or delivery keys. After recalculation, the worker used 1.074 GiB of its 4 GiB budget.

## 0.3.152 — 2026-11-04

Canonical Deploy [41855866227](https://github.com/Tsyzhman/fantasy/actions/runs/41855866227) and independent Check [41855846586](https://github.com/Tsyzhman/fantasy/actions/runs/41855846586) passed for `3e58a9f3d7d45fc9f26b815f9b9c33a80e2d4b65`. Release `20261104T152419Z-v0.3.152-3e58a9f` runs Node 24.22.2. Public health, release markers, web/worker image labels and committed Python hashes agree. PostgreSQL retained its August 19 start time. Exact identities are recorded in `specs/work/evidence/WI-088/release-identity-0152.json`.

This release accepts the exact short personal-round title as well as the legacy comma prefix, preserving identity/calendar validation. Independent review, 50 Python tests and a read-only rehearsal of all 820 observed profiles passed. Full CI also passed 1,379 main tests, 48 browser scenarios (32 intentional viewport skips), database/migration checks, 23 transport tests, types/build and production dependency audit. Lint retained 237 warnings and zero errors.

The preceding 0.3.151/d31ca19 release introduced the approved one-XI/any-active-duel rule, while preserving per-duel freezes and complete personal histories. Its Deploy 41848585353 and Check 41848561363 succeeded; 266 availability probes passed. The subsequent controlled and scheduled acquisitions both failed safely on short round titles and retained the October 21 snapshot. Deployment alone did not satisfy full refresh acceptance.

For 0.3.152, the 882,822,669-byte CI artifact passed local and server digest verification. Download took 333.167 seconds and upload 286.321 seconds without retry. Canonical retention keeps 152 plus rollback 151 and the verified existing database dump. The follow-up cleanup dry-run proposes no further removals.

Release monitoring recorded 312 probes and 20 consecutive successful new-revision/old-CSS checks. One client URLError occurred at 15:31:16 UTC before promotion. The corresponding one-minute Caddy window contains 17 HTTP 200 responses and no unit-journal entries; the client did not retain a finer error cause. Therefore uninterrupted success over the entire observation window is not claimed. See `specs/work/evidence/WI-088/release-0152-network-error-context.json`.

The full controlled refresh subsequently completed 15:42:52–16:19:29 UTC with exit 0, all six Python stages and successful import. Exact file/database/reader SHA-256 is `54e739ad056923d079961feae499dd4c6fd4a0a0371ca9afd22c1f5fea1dbc0d`; generation time is November 4 16:13:16 UTC. Complete history has 68,973 unique observations (including explicit missing lineups); the approved franchise population has 42,572 observations, with all 1,702 freeze events retained. Desktop/mobile UI confirms the new data. All 434 full-cycle availability probes succeeded. There were zero OOM/protected restarts and no duplicate collector; export triggered 1,313 max-boundary reclaim events, so TD-010 remains open for growth headroom. The job container, intermediate files, temporary/expired cache and private job/artifact files are absent. The historical timer failure state was cleared after verified success; its schedule is unchanged. WI-084 and WI-088 are archived with acceptance evidence.

## Source-of-truth rules

Production has three synchronized identities:

1. a Git commit reachable from the GitHub repository;
2. an immutable directory under `/var/www/fantasy-scout-releases`;
3. a Docker image whose revision label and `/api/health` response contain that
   exact commit.

A release is valid only when all three identities match. A local working tree
is never a production source. `npm run release:verify-source` rejects dirty,
untracked, or unpushed source and verifies that the formula model and its
runtime files are tracked.

Every tracked change set intended for merge or release must increment the
stable semantic version in `package.json`, copy that exact version to both the
top-level and root-package entries in `package-lock.json`, and add a dated
`## <version> - YYYY-MM-DD` entry as the newest release in `CHANGELOG.md`. One
version identifies the complete pull request or release candidate; individual
commits inside that change set do not require separate version bumps.
`npm run release:verify-version` checks the local file contract, while CI also
compares the candidate version with the base revision and requires it to be
strictly newer.

The manual GitHub workflow packages `git archive HEAD`, retains the archive as
a workflow artifact, and passes its SHA-256 to the guarded Docker promoter.
The candidate ref must contain current `main`; after the first manifested
release, it must also descend from the commit currently running in production.

Successful promotions append a tab-separated record to:

```text
/var/www/fantasy-scout-releases/PRODUCTION_HISTORY.tsv
```

Each immutable release also contains:

- `.release-name`
- `.release-version`
- `.release-commit`
- `.release-tree`
- `.release-archive-sha256`

Production tags use `production-v<version>-<UTC timestamp>`.

After the `current` symlink is atomically switched, the promoter treats the
release as committed. A later SSH/output failure preserves the active image and
release directory. A failure before that commit point restores both containers
and the prior symlink target.

## Reconciled 2026-07 production line

| Order | Commit/release | Meaning |
| --- | --- | --- |
| 1 | `54c7b9c` | Last commit shared by the old local `main` and later server work. |
| 2 | `4bf13c9` | Formula-based transfer-source support. |
| 3 | `96eb7ed` | RPL transfer recommendation improvements. |
| 4 | `0db9e57` | Foontasy synchronization relative to the active RPL round. |
| 5 | local overlay checkpoint `77f708a` | Formula models/UI, FotMob fixture protection, summer league policy, and retention safeguards that had not previously been committed. |
| 6 | consolidated 0.2.0 line | Merge of both histories plus immutable release enforcement. The production tag is the authoritative final commit. |

## 2026-07-29/30 regression

The formula columns disappeared because releases `96eb7ed` and `0db9e57` were
built from committed server branches that did not contain the uncommitted local
formula overlay. The database retained the version-2 column preference, but the
older runtime neither recognized that object nor contained the formula model.

The 0.2.x release line prevents the same failure mode in four ways:

- every formula runtime artifact and regression test is tracked;
- a release cannot be packaged from a dirty tree;
- the deployed commit is visible and machine-verifiable;
- a candidate that drops the canonical/main or current production history is
  rejected before the server swap.

## 0.3.62 — 2026-09-07

- Release: `20260907T194659Z-v0.3.62-0d05986`; runtime `0d059869b4cff0349ace6fc6d443e611c44b3878`.
- Combined KHL football-style contact sheet, local Arena opportunity ranking/multiple outcomes, retained FDR fix from 0.3.61.
- Deploy [34156552775](https://github.com/Tsyzhman/fantasy/actions/runs/34156552775) success; production browser [34157185770](https://github.com/Tsyzhman/fantasy/actions/runs/34157185770) success (auth 1, UI 10).
- No new migrations or data reset. 694 unique KHL catalog entries; ledger mismatches 0; web/worker healthy, restarts 0. Evidence: `specs/work/evidence/WI-011/`.

## 0.3.120 — 2026-10-07

- Release: `20261007T071643Z-v0.3.120-ccb3653`; runtime `ccb3653261a1e16f2d09f1ff7ffeffeaaf499931`, tree `0c3ea206046d2f1ffa421aae00b09749322c8ae4`.
- Platform-only transfer summaries relative to the latest published round, standalone workflow-validator correction and the checked 0.3.119 GitHub/dependency fixes.
- [PR #39](https://github.com/Tsyzhman/fantasy/pull/39) merged as `d9cbec7839bf45cb1c4bda078f7c3a86cb136dc9` with an identical tree. [Main Check 37587112450](https://github.com/Tsyzhman/fantasy/actions/runs/37587112450) passed 1,260 unit/contract and 20 database tests, production audit, lint, typecheck and build.
- [Deploy 37585870107](https://github.com/Tsyzhman/fantasy/actions/runs/37585870107) passed canary and guarded web/worker promotion. Both image labels, public health and the current release manifest match the exact runtime revision.
- [Production browser 37587009915](https://github.com/Tsyzhman/fantasy/actions/runs/37587009915) passed authentication and 28 desktop/tablet/mobile UI checks, with 20 expected production skips, zero failures/retries. Live aggregate checks returned truthful limited-sample/no-baseline states; no fake counts were inserted.
- No migration, data reset or VPN rotation. Two releases retained, no running canaries, cache expired rows and seven duplicate checks zero; all containers healthy with zero restarts/OOM. Evidence: `specs/work/evidence/WI-053/verification.json`.

## 0.3.121 — 2026-10-08

- Release: `20261008T044407Z-v0.3.121-6e090ec`; runtime `6e090eced498191fe80671c751c897dd73bff1ca`, tree `286f4b97b931dee9fd13b0cb9bef502de70f1d00`.
- Visible franchise league choices with single/multiple/all selection. Date, league and completed-round changes apply automatically after 350 ms; immediate submit/retry, invalid-date feedback, cancellation and URL/profile/reload restoration remain available.
- [PR #40](https://github.com/Tsyzhman/fantasy/pull/40) merged as `37794b8e31a3a0b4c12d471d35010775532a029e` with an identical tree. [Candidate Check 37728507281](https://github.com/Tsyzhman/fantasy/actions/runs/37728507281) passed 1,261 tests and 20 database tests, production audit, lint, typecheck and build. [Deploy 37728525965](https://github.com/Tsyzhman/fantasy/actions/runs/37728525965) passed canary and guarded web/worker promotion; health, both image labels and the manifest agree.
- Native authenticated filter checks passed both themes and 320/390/1440 px, combined real league samples, empty/invalid dates, superseded responses and retry. [Production browser 37729254481](https://github.com/Tsyzhman/fantasy/actions/runs/37729254481) passed authentication and 28 UI checks with 20 production-inapplicable skips and zero failures/retries.
- No migration, data reset or VPN rotation. Temporary viewer/session/virtual-wallet fixtures removed. Franchise source/snapshot and active-job duplicates zero, raw cache expired rows zero, containers healthy with zero restarts/OOM, no running canaries and two releases retained. Evidence: `specs/work/evidence/WI-054/verification.json`.

## 0.3.131 — 2026-10-10

- Release: `20261010T071043Z-v0.3.131-74a5f00`; runtime `74a5f00f162b1d22a6bc7344ee6630e0c354a595`, tree `a8fda2496e9783222b771feada0d28ebc4c98330`.
- New Telegram reports display Sports.ru import placeholders as `затычка`, preserving their identities, lineup roles and mapping warnings.
- [Candidate Check](https://github.com/Tsyzhman/fantasy/actions/runs/38033286179) passed 1,301 tests; [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/38033292827) passed continuous promotion and exact revision verification. Public health, web/worker image labels and the manifest agree.
- 82 availability observations recorded no errors; the prior static asset remains accessible. One healthy web/worker, zero restarts/OOM, zero delivery/report/job duplicate keys, no running canary and two retained releases/images. Reclaimable build cache remains 939.6 MB after canonical pruning; host memory available is 6,231 MiB. Evidence: `specs/work/evidence/WI-064/verification.json`.


## 0.3.145 — 2026-10-23

- Release: `20261023T103559Z-v0.3.145-32fcc3d`; runtime `32fcc3d109cac657f48f7834c892abd04e42c4ae`, tree `d3f7c6eb3e01fa9d24b00da7236f2358ed3e6970`.
- Restore sparse SorareInside schedule parsing, preserve XI provenance during roster imports, normalize inherited runtime configuration and patch Next.js to 16.4.2.
- [Check 39939922888](https://github.com/Tsyzhman/fantasy/actions/runs/39939922888) passed 1,332 unit and 32 database tests, dependency audit, migration drift, lint/typecheck/build and rollout checks.
- [Artifact run 39939918757](https://github.com/Tsyzhman/fantasy/actions/runs/39939918757) built the exact immutable images, then was cancelled during a stalled transfer before promoter startup. The same digest-verified artifact was delivered through local SSH and promoted by the exact committed canonical script, exit 0. Public/web/worker/manifest revisions agree. No production build, migration, data reset or VPN rotation.
- Initial import: 135 applied and 92 unchanged team/competition XIs; following automatic cycle: 227 unchanged. Twelve real authenticated pool readers verify 8,458 published players, 7,374 roster flags and current source revisions with zero discrepancies. Thirty-five source/identity coverage gaps remain explicit.
- Sixty-seven promotion and 600 preparation health observations have zero failures; all ten prior action IDs and the prior CSS hash remain available. Caddy PID remains 754. Saved squads/selections retain exact hashes, duplicate rows/configuration and OOM/restarts are zero, queue is empty, two releases and three READY revisions per scope remain. Temporary transport artifacts were removed. Evidence: `specs/work/evidence/WI-080/verification.json`.

## 0.3.149 — 2026-11-04

Canonical Deploy Production [41819445507](https://github.com/Tsyzhman/fantasy/actions/runs/41819445507) completed successfully. Production history records promotion at `2026-11-04T11:40:13Z`, source `269980b7bbc8d16c850aad89229423f5a2383346`, tree `ae561ecc5d06f4c4431223625a94043c9bd91b76`, release `20261104T112135Z-v0.3.149-269980b` and runtime config ID `sha256:1201dadd6ce48d0a36b263605b6621c80b7cc6e856d1cde70815d169cbb6685f`. Public health, release markers and web/worker revision labels agree; Node is `24.22.2`. CI's containerd manifest identity is cryptographically bound to this classic Docker config identity by the unchanged archive resolver.

The release includes Telegram consent/deadline/recovery fences, native table and modal keyboard behavior, mobile player-column sorting, reduced franchise working copies, exact-source validation, pinned SSH identity and current-run verified artifact transport. Fresh CI passed 1,374 main tests and 48 browser scenarios (32 intentional viewport skips), database/migration checks, build/types and transport regressions. Across the switch, 611 public probes had zero errors and retained assets returned 200 for all 20 post-switch probes.

The workflow retained version 0.3.148 as rollback and the verified 379,894,669-byte database dump. It removed the previous 0.3.147 release, obsolete rollback containers/relay volume and unused project images. Mobile price and forecast sorting were exercised on the real 390/320 px page. Full franchise data-refresh acceptance is tracked separately in WI-088; a successful runtime release does not establish data freshness. Evidence: `specs/work/evidence/WI-084/`, `WI-089/` and `WI-090/`.

## 0.3.150 — 2026-11-04

Canonical Deploy Production [41833423722](https://github.com/Tsyzhman/fantasy/actions/runs/41833423722) completed successfully. At 13:19:56 UTC, public health, current release markers and healthy web/worker labels independently confirmed `1c9264f07f6b508a074232811f69b1d9aae87eb4`, tree `7d959f9fc4728eddbfe007aecbfd420590672afa`, release `20261104T130318Z-v0.3.150-1c9264f` and runtime config ID `sha256:cf9f730e6747050b6eec4f20ed87fd953f656b804ba2546ea9c1802267d1be1a`. The committed sources.py/freezes.py hashes also match the running worker. PostgreSQL has not restarted. The reusable full Check and independent [Check 41833427875](https://github.com/Tsyzhman/fantasy/actions/runs/41833427875) passed, including 1,374 main tests, 48 browser scenarios (32 intended viewport skips) and 37 Python tests.

Before: a fixture shared by source calendar rounds lost all but its last membership, and verifying one franchise duel could modify another duel's states. After: all memberships are retained, only a uniquely consistent fixture/date intersection resolves a round, and updates are isolated to the exact source board. Ambiguous or contradictory evidence still fails closed. Thirty-seven Python regressions include a sanitized real-source fixture and independent duel histories. A complete fresh publication remains a separate WI-088 acceptance check.

Operator delivery took 517.114 seconds. A disconnected SFTP transfer resumed the same closed partial after writer-lock verification; the complete server-side digest and size were verified before the canonical workflow consumed the artifact. Across promotion, 190 public observations had zero errors, including 20 consecutive new-revision/old-CSS successes. The real mobile pool at 390 px again confirmed descending prices 11/11/10/9.5 and ascending 4/4/4/4 without saving a squad.

Canonical cleanup retains 0.3.150 and rollback 0.3.149 plus the verified existing full database dump. It removed 0.3.148 and its obsolete rollback resources; the subsequent dry-run proposes no more removals. The local 882,808,343-byte delivery ZIP remains ignored because automatic execution policy rejected its deletion; no alternate deletion mechanism was attempted. Evidence: `specs/work/evidence/WI-088/*0150*` and `WI-089/production-0150-mobile-390.jpg`.
