# WI-020: Europa League prices and addition le.xlsx

- Kind: `migration`
- Canon action: `none`

## Outcome
Current prices Sports.ru Europa League loaded and players matched in production; After checking the server, the user le.xlsx is updated with new server data columns.

## Specs
- Governing (registered legacy): `docs/integrations/SPORTS_RU_FANTASY_SYNC.md`, `docs/reference/API_ROUTES.md`.
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`; direct user instructions - first the server, then Excel, do not change the original columns.

## Scope
- In: current LE season, regular imports, verified matching/roasters, cache, duplicates and memory; enriched copy of Excel.
- Out: Changes interface, other tournaments and source Excel columns/file.

## Acceptance
- [x] Full current price source verified and imported.
- [x] All matches and omissions have been checked; false connections and duplicates are excluded.
- [x] Server pool and cache checked, memory measured.
- [x] After server readiness, a rich copy with new columns was created; the original cells and design are preserved.
- [x] Tested Excel values, row coverage, and readability; evidence saved.

## Result
Completed 2026-09-13 in production via SSH `deploy`, standard services without changing runtime code or releasing a new version.

Was: 0 LE prices and 0 pool snapshots. Now: 1034 prices, 1034 unique matched players, 36 clubs, 144 matched matches / 8 rounds. All price players are active on their rosters. Fixed incorrect connections between Remiro/Lebarbier and Tiago; the new Sports-only cards are clearly separate from FotMob. Base loaded for 10 commands; for the rest 26 the source did not provide an available squad. The cache has been recalculated, the queue is empty, the 3 snapshot has been saved within the retention limits. Health ok; available memory 5825 MiB, worker 1.652 GiB.

After server verification, `outputs/01a099a1-a982-7ff0-ba8d-333940289db3/le_enriched.xlsx` was created. There were 2 columns and 984 rows on the Combine Sheet; added 179 columns C:FY and the “Server Fields” sheet. The original cells, rows, styles and Log Sheet are preserved. 977 rows were compared, of which 895 with the current price and 82 without it; 7 unconfirmed lines are marked separately. Checking 2280 original and 176136 new cells - no errors; re-import and visual inspection of XLSX is successful.

Evidence: [identity check and restrictions](../../evidence/WI-020/identity-review.md), [server](../../evidence/WI-020/server-audit.json), [Excel](../../evidence/WI-020/verification.json), [source safety](../../evidence/WI-020/preservation.json). Temporary server scripts and uploads have been removed; backup data before changes is stored in evidence. The NO_DATA_QUALITY_AUDIT constraint in the existing metadata is not hidden; Historical totals reflect downloaded matches only.
