# WI-013 - Return five Champions League clubs and set UEFA starts

Kind: fix
Canon action: none

## Outcome
In the Champions League catalog you can see the available players from Sports.ru clubs Bude-Glimt, Brugge, Sabah, Shakhtar and Slavia; 36 clubs have their predicted UEFA starts.

## Specs
- Governing (registered legacy canon): docs/integrations/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: aliases of five clubs, verified scoped mapping/backfill, existing Sports.ru-only identities in the absence of FotMob, snapshot/cache update, tests and production.
User addition: set the predicted starts of 36 Champions League clubs according to the UEFA article from 2026-09-08; save source, check 11 unique players and one GK per club, update snapshot.
Out: fictitious statistics and connections of players, changing existing manual assignments, other tournaments and the KHL.

## Acceptance
- [x] 36 predicted XI verified with UEFA, applied with backup and provenance; repeating does not change the data.
- [x] All five clubs have available players with current price/position Sports.ru.
- [x] FotMob verified connections are used; provider-only records do not receive fictitious statistics.
- [x] Repeat without duplicates, snapshot updated, checks and release completed.

## Result
Diagnostics: all 152 prices are already in the database; player/team mapping=0. FotMob roster: Glimt29, Brugge29, Slavia35, Sabah0, Shakhtar0. Aliases for five names are missing.


Fresh Sports.ru season85 - 1183 prices, five clubs 157 players (25/33/27/32/40). Directory update connected 81 players; scoped plan added 1 more FotMob mapping and 75 Sports.ru-only identities. All 157 are in the published snapshot. Replay: retained157/planned0/unresolved0. Backup: /var/backups/fantasy-scout/wi013-ucl-mapping-20260908.json. Sports-only players do not have fictitious match_player_stats.

According to the UEFA article from 2026-09-08 (source URL saved in scripts/data/uefa-ucl-md1-2026-09-08.json) there are 396 starts: 36 teams × 11, one GK per team, provenanceUEFA 36. The actual match lineups did not change. Transliteration options are clearly discussed; Camara is the forward Suleiman, Haugen is the left back Kristoffer according to position in the ordered XI (interpretation of the source's abbreviated name). Eight missing Sports.ru connections were confirmed with existing FotMob players by club, name and public date of birth. Added 23 verified memberships for 22 Sports-only starters and NoahFernandez; no new CorePlayers were created for this operation.

Backup before starts: /var/backups/fantasy-scout/uefa-md1-20260908-before.json; up to an additional seven links: /var/backups/fantasy-scout/uefa-md1-20260908-prices-before.json. Repeat: priceRepairs0/memberships0, all36UNCHANGED. Final published snapshot:1005 players; all 396 start IDs exactly matched the reviewed source. Five clubs25/33/27/32/40; duplicateprice/playerlinks0; retention3 snapshots. Last refresh RSS767184896bytes at heaplimit1536MiB, process completed. After working web363MiB/worker401.9MiB/Postgres959.7MiB.

Checks: full npmruncheck —1086unitpass/1skip, lint0errors/105warnings, typecheck/buildpass. After adding UEFA CLI: typecheck and focusedlintpass,60 mapping/probable-lineup tests pass. Browser production smoke34206172543 success (desktop/tablet/mobile); initial test incorrectly looked for Pool mobile tab as button, fixed to radio without changing UI.

Release0.3.64: runtimea7dbc118238a492481cb301e80f850ccf0684d22, deploy34205046454 success, /var/www/fantasy-scout-releases/20260908T083637Z-v0.3.64-a7dbc11, /api/health=ok. UEFA is a one-time data operation on top of this runtime; the source type version is erased by TypeScript, no new network adapter/schedule was added.
