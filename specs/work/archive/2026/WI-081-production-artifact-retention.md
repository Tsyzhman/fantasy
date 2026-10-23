# WI-081: Bound production backups and remove build caches

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Production retains the serving release, one rollback generation and one verified full database dump, with no unused host build cache after operator cleanup.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#recovery`
- Constraint: `spec://common/INFRA-006-continuous-deployment#runtime`
- Affected: `spec://common/structure#release-transport`

## Scope

- In: inspect project archives, verify a fresh full database dump before deleting old backups, remove unused build cache and obsolete project artifacts, repair installed scheduled cleanup, retain the policy in source and evidence.
- Out: other applications' images/data/backups, live application caches, PostgreSQL/upload/source volumes, new application deployment.

## Acceptance

- [x] Inventory and explicit retained targets are recorded before cleanup.
- [x] A complete current database dump is verified before old project backups are deleted; exactly one full dump remains.
- [x] Current release and one rollback generation remain usable; temporary archives and unused build cache are removed.
- [x] Future cleanup retains one verified full dump; backup creation is atomic and scheduled cleanup uses the production deployment lock.
- [x] Behavioral tests exercise backup retention, invalid archives and path safety; source/version/workflow checks pass.
- [x] Public health/revision, restart/OOM counters, worker exclusivity, duplicates, memory and disk are checked after cleanup.

## Dependencies

- Related: `WI-080`

## Result

Completed on 2026-10-23. The installed cleanup retains the serving release and one complete rollback generation. The one remaining fresh full PostgreSQL dump is 379,894,669 bytes, verified by complete archive reading and SHA-256 before deleting older project backups. Docker build cache went from 23 records / 227.6 MB to zero; 2,917,605,376 filesystem bytes were freed net of the new backup. Historical table/mapping exports and an unused legacy checkout were removed; all 11,617 extracted research source files remain after the identical TAR was deleted.

The scheduled copy and backup helper were installed from commit `4dc5e5a` with recorded SHA-256, and the weekly command now shares the production deployment lock. The reviewed source at `4b578df` also cleans up unfinished backup partials. All 18 Python deployment tests and all four Linux cache opt-in/mode combinations pass. Full CI [39947294152](https://github.com/Tsyzhman/fantasy/actions/runs/39947294152) passes unit/database tests, dependency audit, migration drift, lint, types, build, restricted-role and rollout checks. Source/version/workflow verifiers and spec-space snapshot pass.

All original container IDs, state/restart/OOM counters and Caddy PID are preserved. Eight public probes during cleanup and five final probes passed with production still on `0.3.145 / 32fcc3d`. Queue, pool/price duplicates, orphan rows and failed migrations are zero; 149 squads and 2,222 selections remain. Final resource readings stay within their budgets, with 5,489 MiB host memory available. There are no temporary task archives left on the host. No new REVIEW or TECHDEBT entries.

Evidence: `specs/work/evidence/WI-081/report.md`, `before.json`, `fresh-backup.txt`, `maintenance-install.json`, `cleanup-dry-run.txt`, `cleanup-apply.json`, `legacy-cleanup.json`, `after.json`, `cache-and-temporary-check.json`, `cache-opt-in-linux.json`, `verification.json` and `ci-check.json`.
