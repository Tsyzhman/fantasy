# WI-012 – Loading actual KHL statistics

Kind: implement
Canon action: direct-edit

## Outcome
Available actual KHL statistics are loaded onto the server and read in the collector.

## Specs
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#providers
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#schema
- Constraint: spec://modules/khl/FEAT-002-khl-squad#cards

## Scope
In: checking sources, calendar/FP history/protocols in available coverage, accurate mappings, limited imports, reloading, production and UI checking.
Out: made-up values, own xG, external transfers and Betting change.

## Acceptance
- [x] The actual available values ​​are visible on the server; coverage and missing fields are listed.
- [x] Repeat does not create duplicates; queries/memory are limited, history is not replaced by aggregates.
- [x] Checks, publications and server audits have been completed.

## Result
Local: 693 profiles dismantled, 638 PLAYED / 375 DNP, 1 quarantine line due to account mismatch. Complete repetition of 693 profiles: changed=0. Unit 1085 pass / 1 skip; lint 0 errors / 105 warnings; typecheck/build pass; three KHL DB tests pass, including FP recall after PLAYED→DNP. Generic DB runner rejected by betting fixture DB protection (requires fantasy_betting_test_*); the KHL target recruitment has been completed. Production 0.3.63 / runtime 28a5427a11c6782f4b31f4eb2d4ceb7a9e6cde2d / release 20260908T075518Z-v0.3.63-28a5427. Deploy 34201405135 success. All 693 profiles have been processed; 1013 player-match (638 PLAYED / 375 DNP), 638 FP, 435 played players / 33 goalie-match. One quarantine Sokolov 2026-09-05 Spartak. Repeat imported=0 / changed=0; receipts 14259 are stable, duplicate groups=0 / raw=0. Control Gregoire 1250sec/7FP and Kulbakov 3573sec/SV33/GA1/15FP coincided. Browser 34202294303 after completion of backfill: auth 1 pass, UI 13 pass / 20 skips (the first premature launch is honestly recorded in docs/guides/KHL_IMPLEMENTATION_STATUS.md). Web/worker healthy / restarts=0; additional CLI process completed, RSS loader 206084→225180 KiB; total web 491.6 MiB, worker 1.11 GiB, PostgreSQL 957.9 MiB. Migrations 46 / unfinished 0. PP/PK/xG are not declared loaded; detailed evidence - docs/guides/KHL_IMPLEMENTATION_STATUS.md.
