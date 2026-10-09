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

Five other teams remain rejected by their own missing roster or identity contradictions. Global source status remains PARTIAL; it is not labelled complete coverage. Both dry-runs retain the existing 5 missing forecasts, 19 absent team/match mappings and one source validation error. Dry-run RSS rose from 137 to 171 MiB; no provider responses enter a global cache.

## Guarded correction

Sports aliases require a fresh price (48h), a matching stored provider mapping, unique club/date evidence and compatible canonical birth date. A repair additionally requires an existing inactive membership, exact league/season/club, a full matching source date and corroborated name, and no active other-club membership. The actual apply rechecks evidence and membership inside the existing XI transaction. Whole-team validation and normal roster source/deactivation remain in place.
