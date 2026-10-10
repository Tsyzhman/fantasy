# WI-064: Release readable Sports.ru placeholders in Telegram

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production Telegram report displays imported Sports.ru placeholders as `затычка` while retaining their stable identities, lineup roles and explicit mapping limitations.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: the already verified report-label change, matching contract clarification, version 0.3.131, an immutable clean release, required workflow checks, continuous promotion and production resource/duplicate verification.
- Out: player identity or squad-storage changes, new mappings, report resending, Telegram messages to users and unrelated working-tree changes.

## Acceptance

- [x] Multiple Sports.ru placeholders render as `затычка`; original IDs, captain/vice-captain roles, ordinary names, mapping reasons and repeat-build uniqueness remain correct.
- [x] The clean pushed candidate has consistent version 0.3.131 and descends from current main and production; the deployment workflow passes its required checks.
- [x] The canonical promoter verifies a second web before the traffic switch; public health, web/worker image labels and release manifests agree on the candidate commit.
- [x] Production web/worker are healthy, delivery/job duplicates are checked, and temporary artifacts, retained releases, cache and memory remain bounded.

## Result

Released 0.3.131 on 2026-10-10: `20261010T071043Z-v0.3.131-74a5f00`, commit `74a5f00f162b1d22a6bc7344ee6630e0c354a595`, tree `a8fda2496e9783222b771feada0d28ebc4c98330`. Before: a Sports.ru placeholder's internal ID was shown as its name. After: new Telegram reports show `затычка`; the original identity and lineup roles remain intact.

The 28 focused report/import tests, lint, TypeScript check, specification validation and repeated-build check passed. [Candidate Check](https://github.com/Tsyzhman/fantasy/actions/runs/38033286179) passed 1,301 tests with zero failures. [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/38033292827) passed all required checks and the canonical continuous promotion. Logs verify candidate readiness before switching, followed by the previous web's 30-second drain. No pending migrations required application.

Public health, both runtime image labels and the release manifest match the deployed commit. The worker's compiled report bundle contains the Sports.ru guard and `затычка`. The continuity monitor recorded 82 successful observations, zero failures and 12 consecutive observations of the new revision; a previous-generation static asset still returns HTTP 200.

One healthy web and one healthy worker remain, with zero restarts/OOM and no running canaries or temporary candidate web. Outbox, report and stage-job duplicate keys are zero; queued report text containing the old Sports.ru placeholder label is zero. Retention keeps two release directories and two project images; the archive was removed. Final memory: web 144.9 MiB, worker 1.358 GiB, host available 6,231 MiB. The shared host's build cache is 40.4 GB after the new retained image; reclaimable cache remains 939.6 MB, below the canonical 1 GB pruning target. Existing shared image layers were retained.

Evidence: [verification](../../evidence/WI-064/verification.json), [continuity](../../evidence/WI-064/continuity.json), [runtime](../../evidence/WI-064/production.txt), [resources](../../evidence/WI-064/resources-after.txt). No new REVIEW or TECHDEBT item.
