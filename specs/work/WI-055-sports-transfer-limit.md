# WI-055: Three Sports.ru transfers per round

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

The Sports.ru squad planner permits three transfers in every round without carrying unused transfers forward, and its descriptions match that rule in both languages on production.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules`
- Affected: `spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Constraint: `spec://common/structure#release-transport`
- Constraint: canonical immutable deployment in `docs/operations/DEPLOYMENT.md`.

## Scope

- In: remove incorrect accumulation copy from both Sports.ru descriptions, correct the configured transfer cap, verify round transitions and legacy opening values, version and deploy the checked immutable revision, inspect runtime resources.
- Out: FPL rule changes, data migrations, new collection jobs, other squad workflows.

## Acceptance

- [x] Sports.ru shows three transfers per round in both descriptions and languages without the incorrect accumulation claim.
- [x] Unused transfers do not increase future Sports.ru allowances; legacy opening values cannot exceed three, including after saved-plan rollover.
- [x] FPL banking remains covered by passing regression checks.
- [ ] Focused checks and required release checks pass on the clean pushed revision.
- [ ] Canonical deployment succeeds and production identities, copy, memory, cache and duplicate-process checks pass.

## Result

Implementation and local verification completed. Three focused regression checks reproduced the previous six-transfer allowance and invalid saved-plan rollover before the fix. After the correction, all 149 tests in squad logic, planner, fixture-calendar metadata and FPL provider checks passed without skips. Typecheck passed; focused lint has zero errors and two existing component warnings. Both cached metadata readers apply current Sports.ru rules on read without altering persisted snapshots, so rollout does not wait for a full pool refresh. Spec snapshot is current with no diagnostics. Production deployment and release checks remain pending.
