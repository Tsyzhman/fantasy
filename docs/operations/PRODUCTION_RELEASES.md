# Production release history

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
