# SorareInside ingestion evidence — 2026-10-09

The user's requested follow-up to WI-057 repairs source ingestion itself. Internet/forum research preceded implementation; diagnosis relies on bounded authenticated source responses and production database records.

## Reproduced discrepancies

At 08:29 UTC all three source lineups were published, future, and contained 11 players with one goalkeeper. Their selected match/lineup IDs agree with the WI-057 production logs.

| Club | Source identity | Canonical record / price evidence | Rejection before correction |
|---|---|---|---|
| Barcelona | `0422fa5d-811b-4f2a-be98-fed4c72ee1bb`, Rodrigo, `rodrigo-hernandez-cascante`, 1996-06-22 | 675088, Rodri; mapped Sports full name `rodrigo hernandez`, same birth date/current club | UNMAPPED, both league 42 and 87 |
| Groningen | `19e91008-bc44-42cf-aba3-b460fc8b86ee`, Jorg Schreuders, 2004-09-09 | Saved Sorare ID 1419385; same Sports ID/name/date/club, last seen 2026-10-08; existing membership inactive since September | ID_NOT_IN_ACTIVE_ROSTER |
| Dynamo Makhachkala | `a83d102a-bc80-45a7-b88d-6fb117b6cf55`, Mahmudjon Maxamadjonov, `makhmudjon-makhamadjonov`, 2003-06-30 | 1477508, Makhmud Makhamadzhonov; mapped Sports full name equals source slug, same date/current club | UNMAPPED |

Each relevant Sports price has a MATCHED provider mapping for that price ID, contest, season and canonical player. A price foreign key alone does not authorize the new behavior. No existing Sorare UUID is replaced.

Primary corroboration: [Rodri full name/date at Barcelona](https://www.fcbarcelona.es/es/noticias/4561492/10-cosas-sobre-rodri), [Schreuders' current league profile](https://eredivisie.com/clubs/fc-groningen/players/jorg-schreuders/), [Makhachkala official announcement](https://2.dinamo-mx.ru/news/mahmud-mahamadzhonov-v-mahachkalinskom-dinamo/), and [FotMob Schreuders ID/date](https://www.fotmob.com/players/1419385/jorg-schreuders).

## Before and after dry-run

Old runtime at 08:34–08:36 UTC: 11 PLAYERS_UNMAPPED, 224 UNCHANGED, 2 READY. Corrected importer at 08:42–08:43 UTC: 5 PLAYERS_UNMAPPED, 224 UNCHANGED, 8 READY. Barcelona (both scopes), Groningen and Makhachkala all resolve 11 unique target IDs. The same guarded correction also resolves Málaga and Vitória de Guimarães.

At that intermediate check, five other teams remained rejected by their own missing roster or identity contradictions. Dry-run RSS rose from 137 to 171 MiB; no provider responses enter a global cache.

## Fresh prerequisite data and final source proof

The Sports.ru worker was configured for Russia, Spain, Netherlands and Portugal only. France, Germany and UCL prices had not refreshed since September. Live Sports.ru still supplied all three scopes; a bounded manual refresh succeeded for all three (2222 current prices), without changing saved squads. In particular, Le Havre's Djibril Ouziad now has the source-confirmed date 2009-04-27 rather than the cached 2007 date. Fresh Latin full-name aliases also resolve the existing Sports-owned Shakhtar IDs without creating or merging players.

Alejandro Pozo's source UUID was independently verified against [FotMob player 785855](https://www.fotmob.com/es/players/785855/alejandro-pozo): full date 1999-02-22 and current ADO membership. The reviewed seed still requires that date and active club; it does not overwrite an existing mapping.

At 09:15–09:16 UTC, the corrected importer with fresh prices had zero PLAYERS_UNMAPPED, 9 READY and 228 UNCHANGED. Every one of the 11 originally rejected scopes resolves a full XI. The operator-owned Sports.ru configuration now covers seven scopes at six-hour intervals; the immutable promoter will apply that configuration to the worker.

Global coverage remains PARTIAL: 5 nearest fixtures have no forecast, 19 have no team/match mapping, and Bodø/Glimt's published source payload has only six starters, verified directly at 09:30 UTC. The source error is a real incomplete XI, so the importer correctly preserves the previous flags. Final dry-run RSS was 188 MiB.

## Guarded correction

Sports aliases require a fresh price (48h), a matching stored provider mapping, unique club/date evidence and compatible canonical birth date. A repair additionally requires an existing inactive membership, exact league/season/club, a full matching source date and corroborated name, and no active other-club membership. The actual apply rechecks evidence and membership inside the existing XI transaction. Whole-team validation and normal roster source/deactivation remain in place.
