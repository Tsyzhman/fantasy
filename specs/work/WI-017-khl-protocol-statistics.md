# WI-017 — KHL protocols, seasonal amounts and forecasts

Kind: change
Canon action: direct-edit

## Outcome
Statistics are collected from individual protocols, including time in attack; season totals and EP are available in Squad, xG source/quality is shown explicitly.

## Specs
- Governing: spec://modules/khl/INFRA-001-khl-data-ingestion#providers
- Governing: spec://modules/khl/INFRA-002-khl-storage-and-api#schema
- Governing: spec://modules/khl/FEAT-003-khl-projections-and-optimizer#forecast
- Affected: spec://modules/khl/FEAT-002-khl-squad#cards

## Scope
In: protocols, player identification, idempotent facts and aggregates, EP/xG, local checks, Git and production.
Out: external rates/transfers, replacing missing metrics with actual zeros, seasonal parsing as a source of aggregates.

## Acceptance
- [x] Match facts and time in attack were checked on real protocols, seasonal amounts are recalculated after correction without duplicates.
- [x] EP is published and visible for real future matches.
- [ ] Ready xG is connected or an explicitly designated evaluation model is agreed upon and implemented.
- [x] Local and UI checks passed before Git and production submission; migrations, memory, cache and reloads are checked.

## Result
Logs of all 29 completed matches 2026/2027 to 2026-09-11 have been locally imported. Time in attack is filled in 27; 901980/901987 contain plugs. In the local directory 423 of a player with time in attack and 435 with EP; 954 known match attack values, 1015 PP/PK, zero duplicates. Repeat all 29 protocols: changed=0; the same fresh forecast revision. RSS re-batch 179 MB, heap 49 MB; read cache=0.

Four focused tests with real PostgreSQL passed without skip: protocol 44 players, ID/column/truncated group rejection, HTTP 403, seasonal amounts and corrections, KHL priority over Sports.ru, border/TTL/reuse EP. General npm run check: 1090 pass, 1 skip, lint 0 errors; the final runtime build is checked before push. Local UI on real data: Gregoire TOI 60:04, PP 8:51, PK 2:07, attack 4:25 with coverage 1/3, EP=24; mobile width 390, overflow=0, duplicate DOM IDs=0.

The final npm run check after correcting the same order of blocking Sports.ru/KHL passed: 1090 pass, 1 skip, lint 0 errors / 117 warnings, typecheck/build pass. Competitive DB test passed without skip. Git runtime dd49fb039e215bddfc0489a8e07c320cd185188c, version 0.3.67, release 20260911T103306Z-v0.3.67-dd49fb0. Deploy [34589500218](https://github.com/Tsyzhman/fantasy/actions/runs/34589500218) success; public health, OCI web/worker and manifest are the same. Previous CI 34588936824 reversed to server steps to fix lock order.

Production: fresh 696 active Sports.ru profiles, remaining=0; archive 29 of verified public protocols imported after migration. Total 1838 player-match; time in attack is known in 959 lines, PP/PK in 1018; seasonal attack for 425 players, EP for 496. 48 of various unconfirmed names left unlinked. The first replay added two Alistrov protocols after confirming his official ID late in the match; the following repetition of all 29: changed=0, forecast cmtwu46wu0002z4vnip8ihcvc and dataRevision=1999 saved. Gregoire: 60:04 / PP 8:51 / PK 2:07 / attack 4:25 (1/3), EP 16.6667 for two future matches; production FP includes a fresh third match, so it's different from the old local example.

48 migrations incomplete 0; backup /var/backups/fantasy-scout/pre-20260911T103306Z-v0.3.67-dd49fb0-migration.dump, SHA256 86005bff4c3e71f23686f832df572bfdf8f7fbba7fdf367c17850e6479631b26; migration was tested on the restored copy before production. Duplicates stat/raw/active jobs=0; raw 29 lines / 99987 bytes, read cache=0, 4 forecast revisions. Final web 293.2 MiB / worker 462.9 MiB / PostgreSQL 1.033 GiB; healthy, restarts=0; free 86 GiB. Local temporary web/PGs are stopped, the test user and his session are deleted.

Production browser [34590394503](https://github.com/Tsyzhman/fantasy/actions/runs/34590394503): auth pass, UI 19 pass / 20 skip / 3 fail. All KHL checks (catalog, plan saving, history) were completed on desktop/tablet/mobile. Three failures - the old Betting UCL event without model.europeanCompetitionId; There were the same errors before the release in 34577499985. The full browser suite is not declared green.

Состояние на 11 сентября: КХЛ возвращала прямому HTTP (включая production IP) 403; worker записал PROTOCOL_HTTP_403 и retryAfter=2026-09-12T10:39:37.838Z. Готовый ixG в протоколах и публичном mobile event отсутствовал; Wisesport описывал партнёрский API, доступного player-match feed не было найдено.

20 сентября, WI-026: доступ к публичным протоколам восстановлен лёгким HTTP-транспортом без браузера; серверный сбор каждый час в :22 проверен. Повтор 65 текущих протоколов после полной сверки игроков: 161 дополненная запись, затем changed=0. Проверены все 697 карточек и даты рождения, подтверждён 691 KHL ID; шесть молодых игроков пока не имеют доступной KHL-карточки. Ограничение 403 больше не является blocker этого WI. Незавершённым остаётся готовый ixG либо отдельно согласованная оценочная модель; фактические голы не подменяют xG. Полное evidence — WI-026 и docs/KHL_PLAYER_AUDIT_2026-09-20.md.
