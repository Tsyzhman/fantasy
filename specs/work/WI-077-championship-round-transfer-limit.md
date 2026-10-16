# WI-077: Six transfers in Championship round eleven

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

The production planner allows six transfers only in the Sports.ru Championship tour starting on 2026-10-16, with three in other tours.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#transfer-rules`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: exact provider-tour exception, cached and live planner rules, counters, suggestions, save validation, rollover and continuous production release.
- Out: squad edits, provider transfers, other league quotas, transfer banking and database migrations.

## Acceptance

- [x] Six transfers are allowed and seven exceed the current Championship allowance.
- [x] Future tours, other Sports.ru leagues and FPL retain their rules; unused exceptional transfers do not carry forward.
- [x] Old cached pools apply the exception without a player-pool rebuild or stored metadata mutation.
- [x] Russian and English interface descriptions show the active tour allowance.
- [ ] Required checks pass and exact release health is verified without a production interruption.
- [ ] Saved squads are unchanged; cache, duplicate processes and memory are checked.

## Result

Local `npm run check` passed: 1323 tests passed, two platform-specific skips,
zero failures; lint has zero errors (236 existing warnings); typecheck and
production build passed. Focused transfer and planner tests passed (131).
Workflow validation and the spec snapshot passed with no diagnostics.
The authenticated production UI before release shows `3/3` for tour 11.
Production promotion and resource verification are pending.
