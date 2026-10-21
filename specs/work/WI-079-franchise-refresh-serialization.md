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

- In: shared process-lifetime heavy-job exclusion, bounded source restoration, collector timing, focused regression checks, immutable production rollout, guarded stale-lock recovery, one complete collection and published-reader/resource verification.
- Out: changing fantasy formulas, reports, user workflows, reducing refresh cadence, unrelated working-tree changes or hosted applications.

## Acceptance

- [x] Reproduce the stale locks and save the OOM process-memory/snapshot baseline.
- [x] Competing heavy jobs wait without overlap; process exit/crash releases the exclusion and child IPC still works.
- [x] Existing source files avoid payload reads; missing sources restore in bounded batches without changing source contents.
- [ ] Preserve three-hour collection and hourly pool cadence; validate checks and immutable deployment provenance while the serving web stays available.
- [ ] Remove only verified stale collection markers, finish collection, and verify the fresh published snapshot through the production reader.
- [ ] Check cache bounds, source/snapshot duplicates, memory/OOM/restarts and temporary-process cleanup.

## Result

In progress. The previous production snapshot was generated 2026-10-10 10:08:20 MSK. On 11 October at 10:00:30 MSK the worker reached its 4 GiB cgroup limit; collection markers remained and every later timer invocation failed. No production mutation has been performed during the diagnosis.
