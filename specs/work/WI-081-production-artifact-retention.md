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

- [ ] Inventory and explicit retained targets are recorded before cleanup.
- [ ] A complete current database dump is verified before old project backups are deleted; exactly one full dump remains.
- [ ] Current release and one rollback generation remain usable; temporary archives and unused build cache are removed.
- [ ] Future cleanup retains one verified full dump; backup creation is atomic and scheduled cleanup uses the production deployment lock.
- [ ] Behavioral tests exercise backup retention, invalid archives and path safety; source/version/workflow checks pass.
- [ ] Public health/revision, restart/OOM counters, worker exclusivity, duplicates, memory and disk are checked after cleanup.

## Dependencies

- Related: `WI-080`

## Result

In progress.
