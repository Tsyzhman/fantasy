# WAL

## Active Checkpoints

### WI-001: Automatic global ranking strategy (@tsyzhman)
- Work: [WI-001](work/WI-001-global-strategy.md)
- Updated: 2026-09-07
- Checkpoint: GLOBAL_AUTO implemented in math, providers, sync, schema, API, Worker and UI. Formula/search/ownership/cache and component browser smoke tests are recorded in evidence; synthetic p95 fits into 2.5x.
- Next: with working PostgreSQL, apply migration using safe-update workflow, perform FPL ownership repair and rebuild old pools; check authorized API/UI and READY contexts; measure saved real pools 20 times after warming up.
- Blocker: PostgreSQL localhost:5433 and Docker Linux engine are not available; FPL returns HTTP 503. The actual migration and live acceptance have not been completed.

<!--
### WI-001: Brief status (@handle)
- Work: [WI-001](work/WI-001-short-slug.md)
- Updated: YYYY-MM-DD
- Checkpoint: what has already been done.
- Next: next step.
- Blocker: —
-->

### WI-017: KHL protocols and forecasts (@tsyzhman)
- Work: [WI-017](work/WI-017-khl-protocol-statistics.md)
- Updated: 2026-09-11
- Checkpoint: 0.3.67 published; 29 protocols, seasonal amounts and seven-day beta EP have been uploaded and tested in production. Repeat changed=0, no duplicates, memory and cache checked; detailed evidence in Result WI.
- Next: get an available player-match ixG feed or a solution based on your own evaluation model; after removing HTTP 403, check the regular downloading of new protocols from the server.
- Blocker: ready-made ixG is not available, a solution for our own model has not been received; The KHL blocks direct HTTP from production IP. Historical data is already displayed.

## Cross-work

## Decisions Pending

- WI-017: available ready-made ixG source or separately matched proprietary model. The current EP remains clearly labeled beta without xG.
