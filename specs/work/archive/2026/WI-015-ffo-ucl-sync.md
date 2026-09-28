# WI-015 - Restore FFO in Squad

Kind: fix
Canon action: none

## Outcome
Available Foontasy predictions are correctly associated with players and visible in Squad.

## Specs
- Governing (registered legacy): docs/integrations/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-001-global-ranking-strategy#root

## Scope
In: diagnostics of FFO sources and current bindings, verified fixes, synchronization and snapshot, production verification.
Out: fictitious predictions, mixing Sports/UEFA scoring, reducing identification requirements.

## Acceptance
- [x] The reason for the absence of FFO has been determined based on the current source and database.
- [x] Available forecasts are imported and displayed in the published pool.
- [x] Repeat without duplicates, cache/memory checked; the necessary code checks/deploys have been completed.

## Result
Initial diagnostics: Champions League Sports922/1037 mappings below 90%; UEFA0/1044 Sports IDs overlap. The current source is examined.

The current source has been verified through the existing authenticated Foontasy parser: Sports1037 rows,1033 intersections with Sports.ru,922 mappings. Squad clearly reads sourceVariant=sports. A separate UEFA bug is related to different external_ids; UEFA scoring has not been tampered with, this source is not used by the FFO Squad column and has not been changed.

Fixed22 verified connections with existing CorePlayers from the current deep-map CLI plan (6MAP_ACTIVE/16MAP_GLOBAL); names/clubs and available DOBs are verified, current assignments are protected by checks.89 suggested Sports-only seeds were not applied. No new players were created. Backup: /var/backups/fantasy-scout/wi015-ffo-mappings-before.json (contains original prices/maps and full reviewed plan).

Staff syncFoontasyForecasts for league42/season2026/2027/sourceVariant=sports successfully imported 1037 forecasts, 944mapped, sourceSeason85, round1. All original completeness checks are retained. Repeat mappingpending0; import samplesAdded0/samplesPreserved1037.

Snapshot updated: 1027 players, 944 with FFO. All 944 values ​​in the published payload matched the source exactly, including obvious zeros. The remaining 10 published league snapshots contain FFO. Duplicates price/player links0, FFO keys0; retention3 snapshots;396 unique starts preserved.

Refresh completed with RSS1045090304bytes with heaplimit1536MiB. After completion web330.3MiB/worker396.2MiB/Postgres958.5MiB. There are no runtime/scheme changes; production remains 0.3.65/af35df1. Checks - real import/replay and exact comparison of published snapshot with source; no additional deployment is needed.
