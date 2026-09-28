# WI-044: Import FPL squads with provider positions

- Kind: `fix`
- Canon action: `none`

## Outcome

The production FPL import accepts a published squad when every mapped player is active for the correct EPL club, preserving the official FPL positions and lineup.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#data`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: reproduce the reported two-player import failure; check shared roster membership independently of provider positions; keep FPL squad validation; bound FPL snapshot transactions; regression verification and immutable production deployment.
- Out: changing shared player identities or roster positions, completing unrelated pool mappings, changing the interface, migrations, storing host VPN configuration in Git.

## Acceptance

- [x] The regression reproduces rejection of active wingers classified as midfielders by FPL.
- [x] Published import preserves FPL positions, all 15 picks, captain and bench.
- [x] Inactive players and players without active membership of their mapped club are still rejected before writes.
- [x] Focused tests, type checking and the required release checks pass.
- [x] The immutable production release imports the linked published FPL squad successfully; repeated import has no duplicate picks or snapshots.
- [x] Cache, duplicate records/jobs and memory are checked after verification.

## Result

The unchanged importer reproduced the exact two-player rejection both in the regression test and through the production HTTP endpoint. Active club membership is now checked independently of position; official FPL positions continue to own squad validation and stored picks. Shared roster rows were not changed. Inactive and wrong-club membership still fail before writes. FPL snapshot transactions have a bounded 30-second timeout instead of inheriting the five-second default.

The application fix was pushed directly to `main` as `d4b7aa225f788f607aca316cf15a5effe9352883` following the user's instruction. The obsolete VPN PR #32 was closed. Host network configuration remains outside Git.

Verification:

- [Check 36435634597](https://github.com/Tsyzhman/fantasy/actions/runs/36435634597): 1213 unit tests and 15 isolated database tests passed; lint has zero errors and 215 existing warnings; typecheck/build passed; production dependency audit has zero vulnerabilities. All 25 focused FPL tests and local type checking passed.
- [Deploy Production 36435851405, attempt 2](https://github.com/Tsyzhman/fantasy/actions/runs/36435851405/attempts/2): all release gates, image/canary verification and guarded promotion passed. The first attempt's dependency installer stalled on a binary-download connection; the retry completed with the existing production containers preserved throughout the failed build.
- Active immutable runtime: `0.3.109`, release `20260928T144700Z-v0.3.109-d4b7aa2`, exact commit `d4b7aa225f788f607aca316cf15a5effe9352883`.
- The production HTTP endpoint imported the linked published GW5 entry on an isolated temporary QA account twice: HTTP 200, 15 picks, 11 starters, one captain, one vice-captain; all positions, bench slots and captain flags match FPL. Both attempts reused one squad and one snapshot. Original user squads were not overwritten by the verification.
- Cleanup confirmed zero remaining QA users, profiles, squads and snapshots. FPL prices have zero duplicate groups; ingestion has zero active jobs. One active web, worker and relay and one stopped rollback for each remain, with zero runtime restarts.
- The startup FPL price/schedule refresh succeeded and published a fresh snapshot at `2026-09-28T14:52:21.384Z`. Overall pool health still reports incomplete mapping: 589 of 667 players are mapped, 78 remain unmatched; all 15 imported picks are mapped. Completing unrelated pool mappings is outside this fix.
- Post-restart memory snapshot: web 162.9 MiB, worker 1.012 GiB, relay 19.78 MiB, VPN 37.84 MiB, PostgreSQL 496.6 MiB, host available 6803 MiB. This verifies the current resource state; it does not establish long-term memory behavior.
- Production retention kept the active release and one stopped rollback and bounded reclaimable build cache to 996 MB; shared image/build layers total 7.019 GB. Local generated Next types total 60132 bytes and TypeScript cache 272783 bytes; no local test process remains.

Sanitized evidence: [verification.json](../../evidence/WI-044/verification.json). The standalone specification snapshot is current with no diagnostics. Version `0.3.110` records this completion evidence; the verified application implementation is unchanged from the deployed `0.3.109` runtime. No new REVIEW or TECHDEBT was introduced.
