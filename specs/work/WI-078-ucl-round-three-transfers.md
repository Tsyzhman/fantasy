# WI-078: Six transfers only in Champions League round three

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production Sports.ru Champions League planner allows six transfers only in tour 2755 on 2026-10-20, then returns to three without carrying unused transfers forward.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: exact provider-tour exception in live and cached rules, regression checks, immutable release and production/resource verification.
- Out: saved squad changes, provider transfers, other league quotas, transfer banking and database migrations.

## Acceptance

- [ ] Tour 2755 permits six transfers and seven exceed its allowance, independent of the local ordinal.
- [ ] Round four and subsequent rounds allow three without banking; other leagues, seasons and FPL retain their rules.
- [ ] Both cached readers and live rules apply the exception without rewriting cached player data or saved squads.
- [ ] Required release checks pass and production UI/health confirm the exact revision with continuous availability.
- [ ] Memory, cache and duplicate-process checks are recorded and temporary resources are cleaned up.

## Result

In progress. Production before the change is 0.3.139 / df9f214a0ded3849308ef94cbf997ce1f6938961. Provider tour 2755 is labelled 3 тур but has local ordinal 2; its deadline is 2026-10-20T16:45:00Z.
