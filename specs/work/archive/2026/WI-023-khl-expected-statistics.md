# WI-023 - Expected performance, opponents and automatic KHL update

Kind: change
Canon action: direct-edit

## Outcome
The user sees the expected statistics and verifiable calculation of each future match; statistics are automatically updated in 10:00 and 20:00 MSK, the bookmaker's line is updated and participates in the opponent's marked assessment.

## Specs
- Governing: spec://modules/khl/FEAT-002-khl-squad#table
- Governing: spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#operations
- Governing: spec://modules/khl/INFRA-003-khl-fonbet-odds#markets
- Affected: spec://modules/khl/INFRA-002-khl-storage-and-api#api

## Scope
In: saved original averages and expected G/A/SOG/PIM/+−, analysis by clicking EP, match corrections on a verified line, full Excel, collection of used sources on a schedule, checks, Git and production.
Out: fictitious ixG, changing official FPs, real bets, bypassing source access restrictions.

## Acceptance
- [x] Real expectations and initial calculation, maximum two decimal digits, are available in the card, EP prompt and full Excel.
- [x] The EP summary summarizes individual match predictions; Available tested coefficients influence the forecast, absence and obsolescence are indicated.
- [x] Script and server schedule 10:00/20:00 Europe/Moscow collects used sources with limited packages, protection against duplicates and saving the last good data.
- [x] Checked mathematics, sources/freshness, Excel, interface, restart, memory/cache; the issue has been published and reviewed.

## Result
Released 0.3.74 / 5ce0976 after 0.3.73 / 288ca41. Expectations and initial calculation are available by clicking EP and in full Excel; 1/X/2 Fonbeta for 60 minutes affects individual matches, clearly marked beta is not issued as ixG. Server timer 10:00/20:00 Europe/Moscow is active, the full cycle has been completed with an honest PARTIAL according to source restrictions.

Checks: 1129 unit pass, lint 0 errors, typecheck/build; targeted PostgreSQL, mathematical and Excel checks; three production UI scenarios with successful repetition of one network navigation. Checked source/freshness, repeat import without duplicates, general deploy lock, saving dictionary check date, revision limit 96, memory/disk and cleanup. Evidence: [release-0.3.74](../../evidence/WI-023/release-0.3.74.md).

REVIEW: code, tests and canon are consistent. Existing ixG/HTTP restrictions 403 remain in WI-017; 16 archived Sports profiles did not pass the identity check and were not assigned a guess. Previous user changes WI-020 are saved separately in the main checkout.
