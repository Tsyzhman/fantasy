# WI-050: Platform transfer trends in Squad

- Kind: `change`
- Canon action: `new-spec`

## Outcome

Each Squad league shows the most frequently added and removed players in saved platform plans compared with the latest published round squad.

## Specs

- Governing: `spec://common/main#root`
- Governing: `spec://modules/machete/FEAT-008-platform-transfer-trends#root`
- Affected: `spec://modules/machete/FEAT-008-platform-transfer-trends#root`
- Constraint: `spec://modules/machete/FEAT-006-sports-popularity#sources`
- Constraint: `spec://modules/khl/FEAT-002-khl-squad#scope`

## Scope

- In: canonical counting rules, football/Sports/FPL and KHL readers, authenticated aggregate API, compact responsive panel, verification of counting, duplicates, freshness and resource bounds.
- Out: external transfers, provider-wide popularity, new collectors/storage, deployment.

## Acceptance

- [x] Active specification is registered and governs implementation.
- [x] Counts use one latest saved variant per active platform participant and the same latest published round, separately per contest/season/provider.
- [x] Missing, incomplete, stale or malformed baseline/plans do not create fabricated buys/sells; changing captain, bench or slots does not count.
- [x] Both top-five lists show participant counts, percentages, round labels and comparable/excluded sample size; empty and failure states are explicit.
- [x] Football, FPL and KHL integration preserves existing controls and KHL access gates.
- [x] Meaningful counting/API/SQL and responsive UI checks pass; cache, duplicate and memory checks are recorded.
- [x] Repository checks and specification snapshot pass.

## Result

Completed locally on 2026-10-06. No release, deployment, migration or provider HTTP collection was performed.

Before: Squad displayed provider popularity without an aggregate of changes in platform participants' saved plans. After: a compact shared panel shows the top five additions and removals for each Sports/FPL/KHL contest, with participant counts, percentages, round labels, sample coverage and a refresh button. Football mobile placement is in the existing Suggestions tab; KHL placement is in Squad. Existing controls and external popularity remain available.

The latest saved variant of each active participant is compared with a complete baseline from the same eligible round. Sports uses the latest started round, FPL the latest completed round, and KHL the latest started verified week. Football plans match the next round by stored identity; KHL uses the current saved entries. Incomplete pairs are excluded without falling back to an older round. Full-roster set differences ignore captain, bench, locks and slots. Saved plans describe platform intentions, not externally executed transfers.

Validation: five direct counting tests and four PostgreSQL/API tests passed. The SQL test counted 101 users with 202 variants exactly once each across two batches. The real football and KHL pages, light/dark themes, top-five lists at 1440/390/320 px, empty/error states and save-event refresh passed browser checks. There was no horizontal overflow or JavaScript runtime error; the sole network 503 was an intentional error-state mock. No production-data coverage or remote CI run is claimed.

`npm run check` passed: 1,239 tests passed, two existing skips, zero failures, zero ESLint errors with 234 existing warnings, TypeScript and production build passed. After the test-only database guard change, the four DB tests and focused lint passed again. The tests recognize the existing isolated CI common database and refuse a non-test database. Spec snapshot is `current`, diagnostics empty, fingerprint `10c6456ac931983189f254d782fb60b64ee65da341b8ab45d9ccdb59dcc6f31d`.

The auxiliary workflow checker passed entrypoint/skill parity, unique BOARD IDs and links, and the current specification snapshot. It failed only `state:connection-kit`: the existing script treats any `.prist/workflow.json` as managed even though this repository explicitly uses standalone mode. The configuration predates this change (2026-09-06); this independent validator defect is recorded as TD-008 rather than changing the declared workflow mode.

Resource checks: 50 read-only calls on the 101-user sample completed in 452 ms; post-GC heap grew by 339,496 bytes, with no persistent row changes. Reads hold at most 100 participant variants per batch. No global cache, collector, polling loop, extra table or dependency was added. This short measurement does not prove the absence of long-term memory leaks.

The dedicated browser, Next server and PostgreSQL server are stopped; ports 3008/55440 are no longer listening. The QA session token was removed. Automatic approval review rejected deletion of the temporary database directory with “blocked by policy”; 75,939,838 bytes remain under `output/WI-050/postgres`. Unrelated processes and caches were preserved.

Evidence: [verification](../../evidence/WI-050/verification.json). Local screenshots and detailed logs remain under `output/playwright/WI-050/` and `output/WI-050/`.
