# KHL 0.3.72 release evidence

Runtime commit: `442b3c61648fb8cf3257c696a70f14091d43d55d`.

## Local validation

- `npm run check`: 1119 passed, 1 intentional skip; lint 0 errors / 139 warnings; typecheck and production build passed.
- Focused PostgreSQL/history/protocol tests: 4 passed, 0 skips.
- XLSX roundtrip: 603 unique players on all four player/period sheets, six sheets total, numeric values and blanks preserved, exact time serials, formula-safe names.
- Browser: all 17 headers and 850 cells have help; page overflow 0 at desktop width. Filtering to Gregoire leaves one visible player, while the export reports all 693 players / six sheets. Past PP help shows 114:29, 60/60 and the official KHL player source. EP help shows actual per-game components and current/prior sample sizes.
- Temporary local UI account and login file removed; local dev server and test PostgreSQL stopped.

## Official archive

- Season 2025/2026 regular competition 1369, mobile stage 370.
- 748/748 regular protocols parsed; four verified All-Star events excluded from 752 mobile calendar events. Example official protocol: https://www.khl.ru/game/1369/898050/protocol/ .
- 813 official players in the archive; 499 of the 539 current Sports historical records enriched locally, including 103 new unambiguous identity links. Remaining players are not forced into uncertain matches.
- Identity requires unique full name, position and identical complete GP/G/A/PM/PIM totals. Existing verified KHL links are reused.
- Repeated import: changed=0, newLinks=0. Sports FP and participation history are preserved.
- Gregoire: 60 games, 126 SOG, 3 goals, 16 assists, 22 PIM, +4, TOI 72441 s, PP 6869 s, PK 4839 s, attack 18415 s. Local EP 12.23 with three current games.
- Normalized bundle SHA256: `ebd01d80e7b59ed4de18a1ba939c807d74c706756357598a12c32eddaeca37c9`, 965655 bytes. No archive raw HTML is stored in PostgreSQL.
- Local raw collection compressed from 121.99 MiB to 6.54 MiB; all 748 entry SHA256 hashes verified before deleting uncompressed copies. Task cache now 38.72 MiB.

## Production

Deployment succeeded: https://github.com/Tsyzhman/fantasy/actions/runs/34818689215 . Health and both OCI revisions match the runtime commit. No new schema migration was required (49 applied, 0 incomplete).

Production import: 499 changed, 102 new verified identity links (one additional link already existed on the server); repeat changed=0/newLinks=0. 539 Sports histories / 24174 PLAYED; 499 have official protocol supplements. Aggregates occupy 540415 bytes. Duplicate history and duplicate archive match IDs: 0. Gregoire exact totals match local evidence. Rolling model khl-history-protocols-beta-v3 published at data revision 4506. Production catalog has 697 players; local test catalog had 693.

Browser acceptance succeeded: https://github.com/Tsyzhman/fantasy/actions/runs/34819687685 . Auth 1 pass; desktop/tablet/mobile 3 pass. All three actual downloaded workbooks parsed successfully: 697 unique player IDs on each player/period sheet, six sheets; 627585, 627590, 627589 bytes. First run 34819350987 read an empty browser network response body; test-only commit c4ed72c switched to the actual saved download and preserved all content assertions. Runtime did not require a change.

Final server audit: healthy, both runtime SHA/OCI match; 49 migrations / 0 incomplete; restarts 0. Duplicate stats/raw/active jobs/history/archive matches all 0. Raw 29 rows / 99987 bytes; 226 forecasts within existing retention. After XLSX traffic: web 340.3 MiB, worker 462.5 MiB, PostgreSQL 1.073 GiB; 85 GiB disk free. Temporary uploaded bundle removed from host/container. No archive HTML or XLSX process cache is retained in the application.