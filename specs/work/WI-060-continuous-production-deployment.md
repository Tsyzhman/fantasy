# WI-060: Deploy a healthy second web version before switching traffic

- Kind: `change`
- Canon action: `new-spec`

## Outcome

Production continues serving users while the next release builds, rehearses compatible migrations and starts; traffic switches only to a verified candidate, with a working previous version available for rollback.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Governing: `spec://common/INFRA-006-continuous-deployment#migrations`
- Governing: `spec://common/INFRA-006-continuous-deployment#recovery`
- Constraint: `spec://common/structure#release-transport`
- Affected: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: the project deployment rule, canonical Docker promoter, Caddy traffic switch, compatible online migration guard, one worker at a time, previous static assets, bounded relay/release retention, live continuity and rollback verification.
- Out: new hosting, a Kubernetes migration, user session changes or restarts of other applications.

## Acceptance

- [ ] The project entry point and deployment specification prohibit stopping the serving web version before a healthy candidate is ready.
- [ ] A second web container starts on the alternate loopback port; checked Caddy reload switches traffic and preserves the previous version through request draining.
- [ ] Untagged/incompatible migrations are refused without stopping production; reviewed compatible migrations are backed up and rehearsed while the current web stays available.
- [ ] There is one scheduler worker; automatic rollback restores the old traffic target and worker, and static assets from both retained releases remain available.
- [ ] Behavioral tests and release checks pass; production polling verifies uninterrupted responses across the real promotion.
- [ ] Cache, duplicate jobs/deliveries, memory and temporary/retained artifacts are checked and bounded.

## Dependencies

- Related: `WI-059`, `WI-042`

## Result

In progress.
