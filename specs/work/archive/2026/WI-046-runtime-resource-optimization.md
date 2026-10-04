# WI-046: Optimize runtime resources without changing product behavior

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

Measured reductions in redundant computation, retained memory and temporary storage, preserving complete Squad data, loading speed, reports and background refreshes in production.

## Specs

- Governing: `spec://common/main#root`
- Governing: `spec://common/structure#root`
- Affected: `spec://common/structure#root` (full Squad refresh process lifecycle)
- Affected: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Constraint: `spec://modules/franchises/FEAT-005-franchise-analytics#contracts`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: local and production profiling, cold/warm/concurrent Squad reads, caches, database work, background jobs, confirmed optimizations, regression checks, immutable release and resource verification.
- Out: changing formulas, reducing data or UI capabilities, reopening WI-045, unrelated applications or deleting source data/backups.

## Acceptance

- [x] Record baseline CPU, RSS/heap, response timings, cache and temporary storage; distinguish process memory from filesystem cache.
- [x] Reproduce and remove measured redundant work or retention with comparable before/after evidence.
- [x] Preserve complete Squad responses, loading speed and existing interactions; preserve franchise histories and calendar report.
- [x] Check parallel requests, collection locks, cache bounds and temporary artifact cleanup.
- [x] Pass required project checks and real browser checks; commit and push the verified source.
- [x] Deploy through Deploy Production; verify matching web/worker/manifest revisions, health, schedules and resources.

## Dependencies

- Related: `WI-045`

## Result

Completed in production on 2026-10-04. Evidence: [measurements and checks](../../evidence/WI-046/verification.json). Git: [PR #36](https://github.com/Tsyzhman/fantasy/pull/36).

- Before, each franchise metric repeated grouping and each request rebuilt the entire report. Now population groups are shared within one aggregation and complete JSON responses are cached for at most 60 seconds/24 MiB/four entries. Snapshot replacement invalidates the cache immediately; idle timers free expired strings. All authentication and snapshot validation still run on every request.
- Twenty controlled local warm runs on the same snapshot average 724.6 → 524.8 ms; temporary heap allocation averages 51.8 → 45.2 MiB. Deep equality passes for the full report, completed rounds, September, an empty interval and all twelve individual leagues. No formula or summation order changed.
- Ten identical production report requests use 25.45 → 3.14 CPU seconds; repeated warm HTTP responses average 2,059 → 93 ms. Every response retains the same 8,517,799-byte JSON hash. Cold response in the controlled request series is 2,260 → 1,628 ms.
- Squad shell/base/details warm loopback means are 103/35/50 → 102/35/48 ms; five parallel details requests average 89.4 → 87.6 ms. All 642 players across ten API pages match the existing production snapshot exactly, with zero duplicates. Saved RPL auto-pick restores as a valid 15-player squad after rollout. Browser load observations are recorded separately from controlled HTTP timings.
- Before, full hourly pool calculations retained native working memory inside the long-lived worker. Now a child performs the same calculation/publication and exits while the parent preserves full/incremental serialization. The production verification cycle publishes all twelve snapshots/8,071 player rows in 98.945 seconds, with zero failures; the child ends with 1.91 GiB RSS and then exits. The scheduler returns to 21:00 Moscow, the queue is empty and retention remains three revisions. The startup missing-only child also passed without unnecessarily rebuilding ready pools.
- Before, publication hashing created a redundant full JSON copy. Direct serialization preserves the hash and changes the measured hashing step from 27.9 → 12.3 ms and 11.7 → 4.4 MiB temporary heap. Allocator tuning was tested and rejected because reduced RSS came with slower reads.
- Initial container working sets were web 746.1 MiB and worker 2.421 GiB; final values after the full cycle and browser checks are 709.9 MiB and 969.2 MiB. Host available memory is 6,406 MiB. Process RSS/heap samples are recorded separately. These different-uptime observations do not establish long-running leak freedom; child exit directly demonstrates release of the heavy calculation's working memory.
- Local full check passes: 1,225 tests, two skips, zero failures; lint zero errors/221 existing warnings, typecheck and build pass. GitHub Check passes all 1,227 tests and 15 database tests; deployment also passes four KHL Python tests and nineteen franchise tests. Dependency audit finds zero vulnerabilities. Production Browser Smoke passes authentication plus 28 checks with 20 conditional skips. Manual report date/group, mobile light/dark, Squad load/save/restore checks pass.
- Release 0.3.114, commit `3741b0a5f344ffc948f254aecaf255216c9452f9`, is deployed by [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/37219910551). Web, worker, health API and release manifest agree; containers are healthy with zero restarts. The first workflow dispatch was rejected before deployment because its workflow SHA differed from the requested branch; the corrected dispatch uses matching refs.
- Franchise data remains 40,078 canonical sources/40,429 observations/75 groups, with the same published snapshot hash and zero source/pool duplicates. Anonymous report access returns 401, invalid dates 400, and an empty interval preserves 75 groups with zero observations. The three-hour collector timer is active, its last run succeeded, the host lock is free and no collection lock files remain.
- Removed the exact QA user, session, saved squad and auto-created betting account; closed private browser sessions, local server, SSH tunnel and inspectors. Removed remote profiling inputs and 49.4 MiB of obsolete local webpack index backups; preserved the useful current cache. Final production retention keeps the active release and one rollback pair, with 971.3 MB reclaimable build cache under the existing 1 GB cap. The displayed 3.102 GB total build cache also includes image-shared records. Canonical franchise storage remains 488 MiB; source data, backups and other applications were not pruned.
- Specification snapshot is current with no diagnostics. No new REVIEW or TECHDEBT remains.
