# WI-079: Serialize heavy refreshes and restore franchise updates

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Production franchise collection, full player-pool refreshes and isolated model recalculations run one at a time; a fresh complete franchise snapshot is published after recovery from the 11 October OOM incident.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#time`
- Governing: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Affected: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Affected: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: shared process-lifetime heavy-job exclusion, bounded source restoration, collector timing, explicit empty H2H lineup handling, bounded interrupted-source resume, verified calendar indexes, focused regression checks, immutable production rollout, guarded stale-lock recovery, one complete collection and published-reader/resource verification.
- Out: changing fantasy formulas, reports, user workflows, reducing refresh cadence, unrelated working-tree changes or hosted applications.

## Acceptance

- [x] Reproduce the stale locks and save the OOM process-memory/snapshot baseline.
- [x] Competing heavy jobs wait without overlap; process exit/crash releases the exclusion and child IPC still works.
- [x] Existing source files avoid payload reads; missing sources restore in bounded batches without changing source contents.
- [x] Preserve three-hour collection and hourly pool cadence; validate checks and immutable deployment provenance while the serving web stays available.
- [x] A verified empty H2H lineup remains missing, is retried later, and malformed/error pages still fail; resume never reuses old database exports.
- [x] Remove only verified stale collection markers, finish collection, and verify the fresh published snapshot through the production reader.
- [x] Use explicit source or matching archived calendar IDs, including gaps; reject absent/conflicting identities without weakening board checks.
- [x] Check cache bounds, source/snapshot duplicates, memory/OOM/restarts and temporary-process cleanup.

- [x] Verify the final disposable-container launcher in the immutable production release, with exact web/worker/manifest revision and active timer.

## Result

The franchise snapshot was atomically published on 2026-10-21 at 13:40 MSK, generated at 13:36:02 MSK. It contains 54,639 report observations (previously 45,234, last generated October 10), 54,162 unique source squads, 87 calendar rounds and 75 groups. The deployed reporting worker successfully rendered the new revision, including the full-season date filter: 86 dated rounds, 53,883 manager observations and a 10,300,236-byte response. Snapshot SHA-256: `a59ecee27820d092cf769c8ebd07fc5a71b2486b234715926210730552e096ab`; gzip 15,791,411 bytes; uncompressed 133,348,723 bytes.

The outcome includes one process-lifetime kernel lock for franchise/pool/model calculations, three-hour franchise starts at :10 MSK, bounded absent-file source restoration, verified missing-lineup parsing, source-only recovery checkpoints, explicit historical calendar IDs and exact UTC-deadline forecast matching. A disposable CLI container isolates the collector from the long-lived worker: 5 GiB RAM/no swap, two CPUs, 128 PIDs, exact worker image digest/network/source volume, and 6 GiB available-host-memory preflight. It exposes no ports or schedulers and preserves both cross-container calculation exclusion and the host deployment lock.

The October 11 outage was caused by a shared 4 GiB worker OOM during overlapping heavy calculations, followed by stale process markers. These markers were removed only after PID/lock/revision checks. Three previously hidden acquisition/calculation issues were repaired: the exact empty historical H2H lineup template, Championship calendar-ID gaps and provider round-number aliases. A later serialized aggregate trial still exhausted the shared worker cgroup and was killed; the main worker and serving web stayed running. The isolated calculation completed with zero OOM events, 4,689,364 KiB maximum child RSS and 2508 MiB minimum sampled host headroom. A full successful acquisition from release 0.3.143 supplied fresh database exports, then the committed 0.3.144 calculations completed every remaining stage in the isolated job and used the supported verified-bundle importer. No old database-export cache override was used.

Final data checks: no duplicate source/index/round/fixture/snapshot identities; 54,639 unique observations; all present XIs have 11 players; zero future-history, duplicate-selection or missing-active-state violations. The source has 244 unavailable canonical lineups (247 membership-expanded observations), retained as missing. Thirty legacy empty-source completion flags were corrected in the cache and database; regular collection retries missing XIs. HTTP cache: 27,258 unique URLs, 213,946,731 compressed bytes, no files older than 30 days, no temporary entries. Intermediate DataFrames, the operator bundle/code, private temporary environment file and job container were removed; source storage and the global lock inode were preserved. The task-local build cache was reduced by 398,078,522 bytes without touching shared dependencies or unrelated worktrees.

Validation: 27 Python tests, 12 rollout tests, the real 87-round/49,915-state/1,320-episode board rehearsal, exact source and spec-space checks, local lint/typecheck/build, plus full immutable CI checks. The specification snapshot is current with fingerprint `db29f2c001bf465fa5d437dd9276671740de7268abffd8bce3eaa8fbc662e489` and no diagnostics. Public sampling across the final promotion recorded 246 HTTP 200 responses and no failures. The final production launcher also passed a real read-only report job; its image/ops hashes match the immutable source, and the job/private environment file were removed. The memory-headroom guard correctly rejected a probe during the startup model calculation; the probe succeeded after that calculation exited.

Completed: Deploy Production run `39585036533` succeeded for commit `703edd62f45e514bbff003221b9fe7d7cd8ee7d0`, version 0.3.144. Public health, web/worker image and current-release manifest agree. Both containers are healthy with zero restarts/OOM in the final generation. One scheduler worker is running; the franchise timer is active/enabled, next 15:10 MSK. No temporary override, job, private environment or release-transport artifact remains. Earlier verified releases were 0.3.141 (`0880d401`, run `39564766149`), 0.3.142 (`bf438b56`, run `39573657599`) and 0.3.143 (`6da22c0c`, run `39580169981`). Run `39583802400` was cancelled before promotion to include memory isolation in 0.3.144.

Evidence: [verification](../../evidence/WI-079/verification.json), [production launcher and published reader](../../evidence/WI-079/production-launcher-reader.txt), [final source checks](../../evidence/WI-079/source-audit-final.json), [isolated job samples](../../evidence/WI-079/resources-isolated.jsonl), [cleanup](../../evidence/WI-079/cleanup-receipt.txt).
