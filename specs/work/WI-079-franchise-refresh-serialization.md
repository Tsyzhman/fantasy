# WI-079: Serialize heavy refreshes and restore franchise updates

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Production franchise collection, full player-pool refreshes and isolated model recalculations run one at a time; a fresh complete franchise snapshot is published after recovery from the 11 October OOM incident.

## Specs

- Governing: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Governing: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Affected: `spec://common/INFRA-006-continuous-deployment#heavy-jobs`
- Affected: `spec://modules/franchises/FEAT-005-franchise-analytics#data`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: shared process-lifetime heavy-job exclusion, bounded source restoration, collector timing, explicit empty H2H lineup handling, bounded interrupted-source resume, focused regression checks, immutable production rollout, guarded stale-lock recovery, one complete collection and published-reader/resource verification.
- Out: changing fantasy formulas, reports, user workflows, reducing refresh cadence, unrelated working-tree changes or hosted applications.

## Acceptance

- [x] Reproduce the stale locks and save the OOM process-memory/snapshot baseline.
- [x] Competing heavy jobs wait without overlap; process exit/crash releases the exclusion and child IPC still works.
- [x] Existing source files avoid payload reads; missing sources restore in bounded batches without changing source contents.
- [x] Preserve three-hour collection and hourly pool cadence; validate checks and immutable deployment provenance while the serving web stays available.
- [ ] A verified empty H2H lineup remains missing, is retried later, and malformed/error pages still fail; resume never reuses old database exports.
- [ ] Remove only verified stale collection markers, finish collection, and verify the fresh published snapshot through the production reader.
- [ ] Check cache bounds, source/snapshot duplicates, memory/OOM/restarts and temporary-process cleanup.

## Result

In progress. Production release 0.3.141, commit `0880d401519052841b7be8d0b217f83f60d46aff`, passed Deploy Production run `39564766149` and exact web/worker/manifest verification. CI passed 1,329 tests, including real Linux flock/IPC/SIGKILL exclusion; local typecheck/build and 12 rollout regression tests passed. Public five-second samples showed no HTTP failure during promotion.

The stale markers for PIDs 25789/25807 were removed only after process/revision/lock checks. One systemd collection started on 2026-10-21 at 11:08:16 MSK. During acquisition the importer uses about 98 MiB RSS, versus 825 MiB at the old OOM; the whole worker is around 1.2 GiB with zero OOM events. A fresh published snapshot is still required before completion.

Next: follow `fantasy-franchises.service` and `specs/work/evidence/WI-079/resources-during.jsonl` (sampler is running through an SSH exec session), then run the deployed report reader, final duplicate/cache/resource/provenance checks, archive this WI and close its board row. Recovery must not be repeated while the service is active.

Follow-up: the first full collection exposed one verified blank historical EPL lineup. The previous snapshot remains published. A narrowly validated missing-lineup parser and a source-only resume checkpoint are being verified under the same atomic recovery outcome.
