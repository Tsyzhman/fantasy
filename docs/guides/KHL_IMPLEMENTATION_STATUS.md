# KHL: status as of September 14 2026

Current issue: **0.3.74 / 5ce0976**, production 2026-09-14. Details and checks: [WI-023](../../specs/work/archive/2026/WI-023-khl-expected-statistics.md).

Previously: the EP tooltip showed the contributions of events to points, matches received the same average forecast. Now: click EP to open real expectations for goals, assists, shots, penalties and plus/minus, raw totals/observations/archived weights and a separate forecast for each opponent. The proven fresh 1/X/2- Fonbet line changes attacking expectations with a fixed beta correction in 60 minutes; without a line, the underlying wait is explicitly used. This is not a trained model or ixG.

Full Excel: 697 catalog entries regardless of page and filters, seven sheets, including expectations. Desktop/tablet/mobile and actual downloads have been verified. The values ​​are displayed with a maximum of two decimal places. Previously added sorting, tooltip and import of Sports squad are preserved.

Complete collection of all used sources is configured at 10:00/20:00 Europe/Moscow. The line and EP are updated separately; identical prices do not create snapshots, the dictionary is rechecked in a full cycle. Deploy and collection share a common lock until the worker stops. The history of new forecasts is limited to 96 revisions and seven days.

The first server cycle checked all 695 current profiles: 1638 PLAYED / 955 DNP, errors of current players 0. Last season: 540 stories / 24238 matches played by players, 499 stories supplemented from 748 official protocols. The result of the PARTIAL cycle: 16 of archival Sports cards do not pass identity verification, the current KHL protocols respond to HTTP 403. Correct data has been saved; archive, coefficients, EP and cleaning done. Ready ixG is not connected; source restrictions remain in WI-017. Below is the history of previous issues.

Working base: `d25913c0831ed94fd6f023c41459802d47f05299`, version 0.3.21, checkout `c18e/fantasy_export`.

The local module has been expanded to a working chain of custody, data reading, scheduling and picking. **Production-ready xG-module this is not:** allowed production feeds, precise controversial scoring boundaries and model testing on real data remain open. Beta baseline does not replace the xG model. There was no deployment, production import, purchase of sources or external transfers. Prist was not used.

## Was → became

| Was | Now |
|---|---|
| Basic KHL tables and universal revisions | External entity maps, historical roster memberships, protocols, availability, official FP, ready xG, provider snapshots, match forecasts, odds snapshots, source contracts and checkpoints |
| The calendar was only understood in memory | Limited mobile transport with descending pagination, checking watermark/duplicates/size; atomic saving and explicit assignments to fantasy weeks |
| Unknown card fields were always stubs | Read normalized data; averages for 5/10/20 matches played, sources and dates, price/FP history, future matches through historical affiliation with the club |
| The selection button is always disabled | Preparation API, Worker ≤1000 candidates/5 seconds, cancel, server check the result, save the conditional local option |
| View settings are not connected | Saving filters, comparison and sorting; profiles G/D/F, minimum TOI, 1–4 official weeks EP |
| Local transfer button counted only in the browser | For saved squad, a server preview with quote, expiry, CAS and idempotent application is used; EP by ownership intervals |
| All amounts were limited to the original 20 000 | Service of confirmed provider snapshots; checking overvalued capital for snapshot holdings + bank; manually changing the squad removes the link to the official baseline |
| Single catalog CLI only | Bootstrap by explicit season metadata, catalog/calendar/baseline commands; coordinator with heartbeat, fencing, bounded retries, checkpoints and health |
| The old web-vitals collector accumulated visibility listeners on clicks | Basic metrics are collected by web-vitals 5.3.0 once per document; compatible 4.2.4 is used for FID only. After 50 transitions, handlers 389 → 389 |

## What has been implemented

- Migrations `000033`, `000034`, `20260907000035`, `20260907000036` isolate hockey from football Core* entities. Shared User contains only reverse ORM relations. SQL checks single target mapping, scope FK, ranges, positions, uniqueness of active jobs and observations.
- `src/server/khl/data-layer.ts`, `observations.ts`, `catalog-sync.ts`: normalized imports, exact IDs without merging by name, A→A dedup, A→B→A history, corrections, separation of DNP from unknown data, field provenance. Repeat Sports.ru tag ID for different lines is rejected.
- `src/server/khl/read-model.ts`: limited queries without process cache, null-aware units, matches by club on the date of the game, official FP separately from EP. Incomplete history is not padded with zeros. The pagination API returns data in a repeatable-read snapshot.
- `src/providers/khl-mobile/transport.ts`: observed endpoint/query only; ≤42 days/100 pages/2000 matches/5 MiB per page, timeout and abort. The CLI requires a verified source contract before mobile downloading. Calendar coverage stores specific from/tos, rather than the absolute completeness of the season.
- `src/server/khl/lease.ts`, `coordinator.ts`: token and expiry are checked when publishing imports within a transaction. Coordinator fixes checkpoint only to the lease owner, repeats temporary errors up to a maximum of 3 attempts, does not loop permanent schema/permission errors.
- `src/server/khl/optimizer-service.ts`: owner, roster version, horizon calendar, latest post, keep/exclude, club/position/budget, unavailable purchases and lock holdings. Already saved transactions count towards the weekly limit. If the external state is unknown, the result has the status CONDITIONAL_DRAFT.
- `src/components/khl/useKhlOptimizer.ts`: one Worker; terminate on completion, cancel, error and unmount. The server rechecks the proposal. Changing the source data invalidates the forecast via dataRevision.
- `src/khl/forecast-model.ts`: exact summation over joint states of participation/TOI/outcome/SV/GA, variance, checking future inputs; interval plan evaluation; MAE/Brier for external validation sets. **This is a computational core, not a trained model of hockey event distributions.**
- `src/server/khl/forecast-publication.ts`: Reproducible publication of separately designated FP10 beta baseline for real scheduled matches 1–4 weeks. There is no made-up xG and no hidden learning from future data.
- `src/server/khl/odds-storage.ts`: separate scopes/periods/lines; unchanged dedup, fixes, withdrawn on full successful snapshot, outage stores old values ​​as stale. An unverified dictionary is rejected.
- The interface contains 17 active places 2G/6D/9F, independent keep and provider lock, cards, comparison, history and calendar. Loaded settings have been moved to SSR to prevent a late response from overwriting user input.

## Checks

- Unit suite: 830 tests, 829 pass, 1 provided skip, 0 fail. Enabled selection from 1000 candidates with time limit and verification of acceptable squad. Run without DATABASE_URL as required by existing configuration test.
- DB suite: 5/5 pass on a separate `127.0.0.1:55439/khl_test`. Mapping conflict, revisions/replay/correction, PP TOI > TOI rejection, null handling, API ownership/CSRF/CAS, quote staleness, idempotency, retry/checkpoint and prohibition of publication with a lost lease have been checked.
- Populated migration audit: in a separate local database, migrations 1–32 were applied, only synthetic football fixtures were restored, then 33–36 were applied. All row hashes 11 of football tables matched. Among them are 80 players, 80 prices, 50 matches, 160 forecasts and 50 odds snapshots.
- `prisma:migrate:diff`: No difference detected. The check was performed with a separate shadow DB.
- Typecheck and production webpack build are running. Lint: 0 errors; KHL localization warnings and the previous football UI warnings remain.
- Football browser regression: 3 pass, 1 provided by mobile journey skip. Original search/selection/save/delete and desktop/mobile responsive tests are run on synthetic data. Checks have not been relaxed.
- Final KHL browser: 9 pass, 16 provided skips (four resource/integration scripts are executed only on desktop; all 17 places are tested on each of the five widths 360/390/768/1024/1440). 50 worker runs: maximum 1 Worker, after completion of 0; heap 5 725 788 → 5 909 972 bytes (+3.22%). 50 filtering: 4 986 844 → 5 129 632 bytes (+2.86%). Cancellation was tested on a real created Worker without using the proposal.
- 50 KHL ↔ FPL transitions after 55 warm-up cycles: heap 8 232 244 → 8 583 060 bytes (+4.26%), documents 1 → 1, DOM 801 → 801, listeners 389 → 389. Threshold 10% saved. The reason for the separate warm-up is confirmed by heap snapshots: about 0.9 MiB of initial growth occurs in V8 compiled code/bytecode; after the first 5 cycles, the total heap still grew by approximately 14%. These local synthetic tests do not prove multi-day stability.
- Telemetry fix builds on [upstream changelog web-vitals](https://github.com/GoogleChrome/web-vitals/blob/main/CHANGELOG.md): listener leak fixes in 4.2.4 and further cleanup of callbacks in 5.x. All six previous metrics, including FID, are retained. Football regression was repeated after this change: 3 pass, 1 skip.

## Resources and termination of local run

- Read process cache KHL: 0 bytes. Raw storage: 7 rows, 182 compressed bytes; duplicate groups: 0. Duplicate active jobs: 0. Overdue previews were deleted 7, test browser sessions were withdrawn 3.
- The Next server running for testing on 3107 and a separate PostgreSQL on 55439 were stopped; There are no listening processes on these ports after stopping. The worker was not left after the tests.
- Automatic check rejected final clear compound command with reason `blocked by policy`; no bypass was performed. Therefore, `.next/cache` (478 246 448 bytes), two diagnostic heap snapshots (27 241 090 bytes), SQL dump of synthetic football fixtures, a local auth file with already recalled session and test databases. In the stopped test database, one old PENDING task remains, provider TEST; background runner is not running. These files are in ignored output/cache and are not included in the original changes.

## Unclosed release dependencies

| Dependency | What else is needed |
|---|---|
| XG-01 | Allowed stable player-match feed of ready ixG, definitions/IDs, previous season and ≥100 matches, ≥95% player/team coverage, ≥90% each club, corrections and 14 days of freshness |
| Full protocols | Verified production source TOI/PP/PK/SV/GA and permission for automatic loading; normalized adapters do not prove the readiness of real feed |
| Scoring and week | Confirmation exactly 10:00/40:00, goalie edge cases and timezone of official reset. Weeks are not calculated on Mondays |
| Fonbet | Real hockey factor/period/settlement fixtures and permitted transport. Football factor IDs not used |
| Provider team | Verified read-only endpoint, owner binding, bank and weekly transfers. While there is no fresh trusted snapshot, import returns unavailable |
| Main model | After receiving feeds: construction and calibration of joint distributions/features on real hockey data, rolling-origin, ≥8 weeks holdout, ablation xG/odds, ≥2 weeks shadow. The computational core and beta baseline do not cover this item |

Long-term observations and training were not carried out and have not been replaced by mocks. Until WI-008 KHL flags remained turned off; The current production connection is described below. Unclosed gates from the table are saved.

## Playback

Only a separate test database. CLI: `npx tsx scripts/khl-runner.ts status`; for mutations you need `KHL_SYNC_ENABLED=true`. Commands: `bootstrap metadata.json`, `catalog CONTEST`, `calendar CONTEST FROM_ISO TO_ISO`, `baseline CONTEST WEEK_ID[,WEEK_ID]`, `prune`. Bootstrap requires explicit season/provider IDs and evidence.

Test fixtures: `scripts/khl-seed-test.ts`, `scripts/khl-football-regression-seed.ts` require `KHL_TEST_DATABASE=true` and the exact local URL. Browser configs: `playwright.khl.config.ts`, `playwright.khl-regression.config.ts`. Test authorization files should not end up in git.

## General release integration 0.3.58

7 September the module was merged with the existing production d9abf51 and a complete local snapshot of global strategy, rotation risk and contact-sheet UI. For the first production use, four not yet released KHL migrations have been renamed 20260907110000–20260907110003; SQL saved. The historical numbers in the checks above refer to the isolated original checkout.

On the merged version: 1070 unit tests, 1069 pass, 1 skip; lint 0 errors/101 warnings; typecheck/build pass; 46 migrations on a new test database and schema diff without discrepancies. KHL DB tests and Arena wallet concurrency/settlement test were completed separately. Old football fixtures are supplemented with the provider's calendar.

KHL browser: 9 pass/16 provided skips. After 55 warm-up and another 50 transitions full heap 8 661 312 → 9 604 204 bytes (+10.89%); snapshots show the growth of V8 compiled code. Checking held JS data now separately excludes code/native: 2 236 184 → 2 236 444 (+260 bytes); data threshold 10%, DOM 852 → 852, listeners 395 → 395. This is a change in methodology, and not a statement about passing the previous limit of total heap. Worker 5 929 880 → 6 094 168 bytes, maximum 1, after completion of 0; filters 5 112 444 → 5 278 928.


## Production 0.3.60 — WI-008, 7 September 2026

Real catalog Sports.ru 107 included: season 2026/2027, mobile stage 407 / official season 1436, 694 unique players and 22 clubs. KHL_ENABLED and KHL_SYNC_ENABLED are enabled; The worker updates only this public directory through fenced jobs every 45 seconds after the previous loop completes. Unconfirmed calendar/protocol/xG transports are not included. The last native version is restored upon entry, the new one opens explicitly.

The same catalog updates freshness without new receipts/revisions. Production: receipts 2776 were saved over the next few cycles; raw=0, duplicate player/entry groups=0, one reused QA draft. The number of receipts increased only during initial imports/restarts; the cache contains no more than five fingerprint/timestamp pairs.

Runtime 15b5a6c9083cf60a292a90f7ef4bf9167c5b0bdd, release 20260907T112939Z-v0.3.60-15b5a6c. Deploy workflow 34116440816 success. Full CI: 1075 tests pass, lint 0 errors/98 warnings, typecheck/build pass. Production browser workflow 34117242298: auth 1 pass, UI 10 pass/17 skips; real KHL catalog/save/reload/return/new-variant and Betting/UCL cases took place on desktop/tablet/mobile. Skips refer to separate seeded local suites and two mobile journey cases.

After smoke: web 433.6 MiB, worker 131.3 MiB, PostgreSQL 1.188 GiB; web/worker healthy, restarts=0. There are no new migrations: 46 applied migrations, one previous rolled-back audit row, unfinished 0. Betting/reset details and general release evidence are in WI-008.


## Production 0.3.63 — WI-012, 8 September 2026

Was: only catalogue/price/lock, 0 player-match and 0 official FP. Now: all 693 active Sports.ru 107 profiles have been checked, 1013 player-match has been loaded (638 PLAYED / 375 DNP), 638 official FPs, 435 played players and 33 goalie-match. Repeated CLI: imported=0, changed=0, remaining=0; receipts 14259 → 14259, duplicate stat/score groups=0, raw=0 bytes. One quarantine: Egor Sokolov / 2026-09-05 / Spartak, the card account does not match the calendar; line not published. Profiles without matches played do not receive a fictitious average of zero.

Production control: Gregoire 2026-09-05 - 1250 sec / 7 FP, 2026-09-07 - 1010 sec / 17 FP; Kulbakov 2026-09-07 - 3573 sec / SV33 / GA1 / 15 FP. In history, FP cards are now placed next to a specific match along with TOI, G/A/+−/PIM or SV/GA. PP/PK TOI and ixG remain null; full protocol/xG and forecast readiness are not declared ready.

Worker is running limited background batches, the primary CLI has completed 35 batches and freed its process. Its RSS 206084 → 225180 KiB during import; after completion there is no additional process. The resulting containers: web 491.6 MiB / worker 1.11 GiB / PostgreSQL 957.9 MiB, healthy. At the time of import, an existing separate football predictions process was running in parallel; after its completion, memory decreased. 46 migrations applied, incomplete 0; The schema has not changed in this release. Local QA files 16.2 MB, runtime HTML is not cached; native test PostgreSQL has been stopped.

Runtime 28a5427a11c6782f4b31f4eb2d4ceb7a9e6cde2d, release 20260908T075518Z-v0.3.63-28a5427. Deploy workflow 34201405135 success. Local 1085 unit pass / 1 skip, lint 0 errors / 105 warnings, typecheck/build pass; 3 KHL DB tests pass. Shared DB runner stopped by Betting protection from someone else's fixture DB; the KHL target set is made separately.

Production browser 34202294303: initial launch before the backfill was completed gave 10 pass / 20 skip / 3 history fail due to the control profile not yet loaded. Repeat after backfill: auth 1 pass, UI 13 pass / 20 provided by skip, including real FP/TOI and no horizontal card overflow on desktop/tablet/mobile. Web/worker restarts: 0.

## Production 0.3.67 — WI-017, 11 September 2026

Was: Sports.ru match data and official FP, without time in attack/PP/PK and without published EP. Now: seasonal amounts from individual protocols, separate coverage of each field, PP/PK/attack in the catalog, card and history; a seven-day EP explicitly labeled BETA_BASELINE. The averages of the last 5/10/20 matches are saved. EP = average official FP × frequency of participation × actual future games; this is not a trained xG model.

In production, all 696 active Sports.ru cards have been updated and 29 protocols of completed matches of the season 2026/2027 have been loaded. In 27 protocols the attack is filled; 901980/901987 contain plugs. From 1838 player-match attack is known in 959, PP/PK in 1018. Seasonal attack is available for 425 players, EP for 496, ixG for 0. What remained were 48 of various unlinked names: they were not substituted based on fuzzy similarity. Two old matches of Alistrov were enriched after the exact official ID from the later protocol; final repetition of 29 files changed=0, forecast revision has not changed.

Gregoire Control: 3 match, TOI 60:04, PP 8:51, PK 2:07, attack 4:25 with coverage 1/3; EP 16.6667 for two future matches. The lack of attack in other games does not turn into zero. Direct khl.ru HTTP with production IP returns 403; worker made one unsuccessful attempt and paused until 2026-09-12T10:39:37.838Z. New protocols are not automatically promised until access is restored. No ready-made player-match ixG feed was found, our own model was not implemented; WI remains Blocked.

Runtime dd49fb039e215bddfc0489a8e07c320cd185188c, release 20260911T103306Z-v0.3.67-dd49fb0. [Deploy 34589500218](https://github.com/Tsyzhman/fantasy/actions/runs/34589500218) success: 48 migrations incomplete 0; restoring backup and rehearsal to production. SHA256 backup 86005bff4c3e71f23686f832df572bfdf8f7fbba7fdf367c17850e6479631b26. Health/manifest/OCI of both services are the same, restarts=0.

Local npm run check: 1090 pass / 1 skip, lint 0 errors / 117 warnings, typecheck/build pass; The focused PostgreSQL test additionally checks the competitive record of Sports.ru/KHL. UI tested on desktop/390px, overflow=0, duplicate DOM IDs=0. [Production browser 34590394503](https://github.com/Tsyzhman/fantasy/actions/runs/34590394503): auth pass, 19 UI pass / 20 skip / 3 fail; all KHL scenarios passed on desktop/tablet/mobile, three previous failures belong to the Betting UCL model and were reproduced before release.

Duplicates stat/raw/active jobs=0. Raw 29 rows / 99987 bytes, read cache=0, 4 forecast revisions; final web 293.2 MiB / worker 462.9 MiB / PostgreSQL 1.033 GiB, free 86 GiB. The temporary local site and PostgreSQL are stopped, the created test account/session is deleted. Complete production evidence is stored in Result [WI-017](../../specs/work/WI-017-khl-protocol-statistics.md).
