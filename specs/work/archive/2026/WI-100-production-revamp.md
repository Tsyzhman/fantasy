# WI-100: Promote the repository revamp to production

- Kind: `migration`
- Canon action: `none`

## Outcome

Production serves revamp version `0.3.157` from `a743a1dcd8929b48809192567fbabcfb68569fed` after an independently verified dry run and continuous rollout.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: publish the exact WI-098/WI-099 revision, run fresh CI and an immutable dry run, promote through Deploy Production, verify public availability and release retention, and record actual timings and resource use.
- Out: schema changes, product changes beyond WI-098/WI-099 and host-wide cleanup.

## Acceptance

- [x] The exact revision contains current main and the serving commit, and has no migration or schema diff against production.
- [x] Dry run and promotion validate the same committed revision and publish verified release artifacts.
- [x] Public health, the host release marker and running runtime image labels agree on the promoted revision. Probes cover the traffic switch and the old asset, and the remaining routes pass their canaries.
- [x] The rollout leaves one healthy worker, a rollback release, bounded temporary storage and no new restarts or OOM. Duplicate and queue checks and measured durations are recorded.

## Result

Completed on 2026-11-06. Production serves `0.3.157` from `a743a1dcd8929b48809192567fbabcfb68569fed`, tree `bc7cbaa1ee2522061268e8362e896a39ba8bb2a8`, as `20261106T104343Z-v0.3.157-a743a1d`. The candidate descends from main `bd493e0` and the previous production commit `ac22b54`. The Prisma schema and migration directories match the previous production revision.

[Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42202407578) passed in 10m39s. [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/42203880768) passed in 20m06s, including 7m04s of fresh CI, 3m50s of Linux image building, 5m23s of verified transfer and 2m10s of promotion. The two runs spanned 31m37s wall time. Both packaged source SHA-256 `c4f11d5378f0027d1c0f281fa391451fb2b635c72c73bd5fbf408dd24c3e4783`. Compared with 0.3.155, the live artifact fell from 816,130,563 to 754,317,916 bytes and delivery fell from 6m50s to 5m23s. Full live workflow time rose from 19m59s to 20m06s.

Public health first returned the new revision at 10:54:52 UTC. All 263 pairs of public health and prior-CSS requests passed, including 31 pairs on the new revision. Loopback health, the release manifest and both runtime image labels agreed on the exact commit. The three authenticated Squad canaries returned 200. The old Baltika page and API returned 404, and the retired formula endpoint returned 410 with `FORMULA_RETIRED`. The runtime manifest listed 102 App Router entries and confirmed the remaining Machete, KHL, Mixerr, Franchises and Arena routes.

Caddy and PostgreSQL retained their processes. Host sampling observed at most two web generations and one worker, with at least 5,207 MiB of available RAM. The new web and worker were healthy with zero restarts and OOM, and the worker measured 1.046 GiB of its 4 GiB budget after warm-up. The Squad queue was empty, all 12 scopes retained three READY cache revisions, and player, stage-job, report and Telegram delivery duplicate counts were zero.

The release directory went from 54,654,829 to 26,399,276 bytes. Retention left the current release, 0.3.155 for rollback and one full database dump. Current transfer files were consumed. The closed 249,753,600-byte partial from failed run 42099830993 was removed under the production lock after a writer check. The shared Docker build cache measured 3.054 GB before and after.
