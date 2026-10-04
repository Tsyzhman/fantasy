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

- [ ] Record baseline CPU, RSS/heap, response timings, cache and temporary storage; distinguish process memory from filesystem cache.
- [ ] Reproduce and remove measured redundant work or retention with comparable before/after evidence.
- [ ] Preserve complete Squad responses, loading speed and existing interactions; preserve franchise histories and calendar report.
- [ ] Check parallel requests, collection locks, cache bounds and temporary artifact cleanup.
- [ ] Pass required project checks and real browser checks; commit and push the verified source.
- [ ] Deploy through Deploy Production; verify matching web/worker/manifest revisions, health, schedules and resources.

## Dependencies

- Related: `WI-045`

## Result

In progress. Initial production observation: web 746.1 MiB; worker 2.421 GiB; available host memory 5,377 MiB. These are container working-set measurements, not proof of a leak.
