# WI-022 - Full statistics and last season in the KHL forecast

Kind: change
Canon action: direct-edit

## Outcome
The user compares shots, goals, assists, penalty minutes and plus/minus and sees a single explainable EP based on last season with a short current history.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#table
- Governing: spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#normalization
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#schema
- Constraint: spec://modules/khl/FEAT-001-khl-module-and-rules#scoring

## Scope
In: individual indicators and sortings, maximum two decimal digits in the UI, import of 2025/2026 Sports history and addition of official KHL protocols (shots, exact TOI/PP/PK/attack), labeled prior and EP formula with breakdown, tooltips of all headers/cells and full XLSX of the entire catalog, local checks, Git and production.
Out: fictitious individual xG, change in official FP awarded, unconfirmed number of deletions instead of known penalty minutes, football data.

## Acceptance
- [x] All headings and cells of the KHL catalog have an explanation of the meaning, calculation and significance; full XLSX includes the entire tournament catalog regardless of filters and pagination.
- [x] Five indicators are visible, sorted, null is different from zero; numeric display is limited to two decimal digits.
- [x] Last season downloaded locally and on the server; the sources, coverage and lack of history are visible.
- [x] Available archived KHL protocols expand on last season with exact totals and separate coverage; Replays do not double matches, official FP Sports are retained.
- [x] Short current story uses last season in EP; G/A/SOG/PIM/+− participate in the explanatory calculation without double counting of goals.
- [x] Checked import idempotency, influence of inputs on forecast, and lack of future data.
- [x] Release and browser check completed; memory, cache and duplicates are checked.

## Dependencies
Related: WI-021, WI-017.

## Result
Completed 2026-09-14. On production 0.3.72, runtime `442b3c61648fb8cf3257c696a70f14091d43d55d`; checking of the downloaded file has been fixed with a separate test-only commit `c4ed72c`. [Release](https://github.com/Tsyzhman/fantasy/actions/runs/34818689215) and [browser check](https://github.com/Tsyzhman/fantasy/actions/runs/34819687685) successful.

There was: a brief current history, Sports archive without SOG/PP/PK/attack, unexplained cells and lack of complete KHL unloading. Now: 539 Sports-stories / 24174 matches played; 499 stories are supplemented by the official results of 748 regular season protocols 2025/2026. Locally 103 new connections, on the server 102 (one more already existed); repeat changed=0/newLinks=0. FP Sports saved. Throws and implementations from last season are included in the marked EP v3 with a weight of no more than 20 matches.

Gregoire has 60 past matches: 126 shots, 3 goals, 16 assists, 22 penalty minutes, +4; TOI 1207:21, PP 114:29, PK 80:39, attack 306:55. The interface has separate sortable indicators, a maximum of two decimal digits, tooltips for all 17 headers and cells with source/coverage/calculation, and keyboard/phone help. When searching for one player, Excel downloads the entire directory: on the server 697 unique IDs and six sheets, the local directory contained 693.

Checks: full npm run check — 1119 pass / 1 skip, lint 0 errors / 139 warnings, typecheck/build pass; PostgreSQL/history/protocol suite - 4 pass / 0 skip; XLSX roundtrip - all lines, numbers/empty cells/exact time/string names. Production: auth 1 pass, desktop/tablet/mobile 3 pass. Each actually downloaded XLSX 627585–627590 bytes, 697 rows on each statistics sheet. The first check erroneously read an empty network response buffer; checking the saved download confirmed the entire file without changing the runtime.

After export: health/OCI match, 49 applied migrations, incomplete 0, restarts 0. Duplicates stat/raw/active jobs/history/archive match IDs - 0. Raw 29 / 99987 bytes, historical aggregates 540415 bytes, 226 forecast revisions in existing retention. Memory: web 340.3 MiB, worker 462.5 MiB, PostgreSQL 1.073 GiB; free 85 GiB. The temporary bundle on the server has been deleted. Local sources are compressed 121.99 → 6.54 MiB after checking all 748 SHA256; test account, password and processes are deleted/stopped.

Ready-made ixG and direct auto-update of protocols with production IP remain limitations of WI-017; this work does not declare them ready. Full evidence: [release-0.3.72](../../evidence/WI-022/release-0.3.72.md).
