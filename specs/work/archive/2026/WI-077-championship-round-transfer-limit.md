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
- [x] Required checks pass and exact release health is verified without a production interruption.
- [x] Saved squads are unchanged; cache, duplicate processes and memory are checked.

## Result

Local `npm run check` passed: 1323 tests passed, two platform-specific skips,
zero failures; lint has zero errors (236 existing warnings); typecheck and
production build passed. Focused transfer and planner tests passed (131).
Workflow validation and the spec snapshot passed with no diagnostics.
The authenticated production UI before release shows `3/3` for tour 11.
Production version `0.3.139`, commit `df9f214a0ded3849308ef94cbf997ce1f6938961`,
was promoted by the unchanged canonical script with exit code zero. CI checks
and image builds passed in run `38931230094`; its slow SCP transfer was
cancelled before promotion. The exact retained artifact was downloaded directly
over HTTPS and its ZIP, source and image checksums verified before promotion.
No migrations were required. Candidate domain canaries passed; traffic moved
from port 3000 to 3001 with the previous web serving through the 30-second drain.

Authenticated production UI shows `0/6` for tour 11 and `0/3` for tour 12.
Public health, image labels and release manifest agree on the exact commit;
the previous JavaScript asset still returns HTTP 200. The rollout monitor
recorded 119 successful health requests and zero errors. All 13 saved squads
and the cached pool metadata have unchanged checksums. There is one healthy
web and one healthy worker, zero new restarts/OOMs, two retained releases,
and 6272 MiB available host memory. Temporary artifact files (872177728 bytes)
were removed. See `specs/work/evidence/WI-077/production-verification.json`.

No new REVIEW or TECHDEBT items.
