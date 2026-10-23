# WI-080: Restore production lineup updates

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

Production starting-lineup refreshes consume the current authorized source safely and publish verified teams again; deployment preserves the working runtime and bounded configuration.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#source`
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#errors`
- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: reproduce the production source/schema failure, repair its demonstrated cause, preserve forecast metadata through ordinary roster imports, inspect related source/runtime failures, prevent repeated deployment environment duplication, update the runtime dependency rejected by the mandatory audit, validate and deploy the exact immutable correction, refresh and verify source-backed starting flags and published player pools.
- Out: invented lineups/identities, saved user-squad changes, unrelated design or press-conference work, changes to other hosted applications.

## Acceptance

- [ ] Capture the failing production revision, source response discrepancy, affected data freshness and resource baseline.
- [ ] Reproduce the defect in a focused regression and preserve invalid/incomplete-source safeguards.
- [ ] Correct the confirmed source/deployment defects and pass applicable checks.
- [ ] A real database regression confirms repeated roster imports preserve the applied XI and its protection metadata while refreshing club display metadata.
- [ ] The required dependency audit and full CI checks pass on the patched Next.js runtime; original action identities and old static assets remain available after promotion.
- [ ] Promote an exact checked release with the canonical continuous deployment; preserve availability and verify web/worker/public revision agreement.
- [ ] Run a real lineup refresh and verify applied/unchanged/skipped counts honestly, including current published pool readers.
- [ ] Verify bounded cache/configuration, duplicate rows/processes, memory/OOM/restarts and temporary cleanup after recovery.

## Result

In progress.
