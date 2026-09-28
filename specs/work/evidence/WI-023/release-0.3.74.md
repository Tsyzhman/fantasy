# WI-023 - releases 0.3.73 / 0.3.74

## Before / After
- Before: one average FP multiplied by the number of matches; tooltip showed the contribution of goals to FP, and not the expectation of goals itself. After: the original totals, known observations, historical weights, G/A/SOG/PIM/+− expectations and each opponent's individual forecast are stored; Clicking EP opens the analysis, Excel contains the seventh sheet with all the players.
- Before: continuous partial collection. After: a complete limited cycle of all used sources in 10:00/20:00 Europe/Moscow, host flock, individual source statuses; the fresh line and forecast are checked between these cycles.
- Fixed errors confirmed by a full run of the calendar boundary and rollback of the entire history due to a conflict in the week of one match. Four all-star games have been removed from the regular season archives.

## Coefficient source
Public `events/listBase` and `line/factorsCatalog/tables`, the same Fonbet source that uses the football parser. Definition snapshot: [fonbet-dictionary.json](fonbet-dictionary.json). Compact fixture: `src/providers/fonbet/fixtures/khl-line-20260914.json`.

Tested 12 real KHL matches; “Hosts/Guests” aggregate, subsidiaries and live events are excluded. In the “Outcomes” table 921/922/923 - 1/X/2; the final victory of 7035/7036 is not included in this model. The main time is confirmed by [rule 10.1 Fonbet](https://fonbet.kz/rules). Other hockey markets are still unconfirmed. Removing margin by normalizing inverse odds follows [documentation penaltyblog](https://penaltyblog.readthedocs.io/en/latest/implied/implied.html).

Amendment `0.75 + 0.5 × (Pwin + Pdraw/2)` - fixed beta heuristic for G/A/SOG, not trained model and not implied goals/ixG. If the line is incomplete or outdated, use 1 with an explanation. The proximity of the match reduces the TTL to 5 minutes; otherwise 30 minutes.

## Local check 2026-09-14
- Full `npm run check`: 1127 tests, 1126 pass / 1 skip / 0 fail; lint 0 errors, 152 warnings; typecheck and production build passed. The first run revealed CRLF in the shell file; LF was restored, a second full run was completed.
- After the latest fixes: 10 target tests pass; PostgreSQL regression: 2 pass / 0 skip; additional `tsc --noEmit` passed. Production CI repeats the full check on the exact commit.
- Full daily: processed 695 current profiles, 1638 PLAYED / 955 DNP, 0 failed profiles. 316 conflicting week bindings are isolated, correct historical data is saved. The archive of official 748 matches was taken from the already downloaded data. Line, EP and cleaning completed.
- Summary of sources PARTIAL: KHL responds `PROTOCOL_HTTP_403`; 16 archived Sports profiles did not pass identity verification. The last correct data has been saved; errors did not stop other sources.
- In the local production build, the transition from Gregoire's EP was checked: expected goals 0.13, assists 0.47, shots 3.46 for the period; 5.61 EP against Dynamo (coefficient 0.96), 5.69 against Admiral (obvious lack of line). These values ​​depend on the fresh line.
- Repeating one set of coefficients did not create snapshots; old observation rejected. Double statistics and raw: 0; raw 33 / 100091 bytes; saved projections 12.72 MB; RSS of a separate check 100 MiB. New EP revisions are limited to 96 per tournament and seven days.
- Spec snapshot: current, diagnostics missing.

## Production
First runtime 0.3.73 / `288ca41be9de16b0ae205dd4cb8e8fa81497654b`: [deploy 34825273164](https://github.com/Tsyzhman/fantasy/actions/runs/34825273164) success. CI: 1128 pass / 0 skip / 0 fail, lint 0 errors / 153 warnings, typecheck and build passed. Web/worker healthy, restarts=0, 49 migrations without unfinished ones. Timer enabled/active, next point 2026-09-14 20:00 MSK.

The first odds source encountered a database timeout during startup; automatic repeat 09:05 UTC successful, 12 matched, subsequent minute observations HEALTHY. Before launching web/worker/PG: 333.8 MiB / 1.184 GiB / 1.058 GiB; during the full collection of 420 MiB / 1.577 GiB / 1.041 GiB. Disk: 85 GiB free. Temporary local account, its sessions/password deleted; local servers are stopped; 27 temporary probe files have been deleted.

[Browser 34826073345](https://github.com/Tsyzhman/fantasy/actions/runs/34826073345): auth pass; desktop/tablet/mobile completed successfully, desktop required a retry (the first request fell between the dataRevision change and the publication of the new EP during collection). 2 pass + 1 flaky retry-pass; this is not passed off as a run without repetitions. Actually downloaded Excel: 697 records on each of the five player sheets, seven sheets in total, approximately 1.1 MB with published expectations. Fields, formulas, cards, sorting, retention of selected squad and screen widths are checked.

The final check revealed that a regular line update was shifting the dictionary check date. In 0.3.74, the date is saved between checks, and each full cycle checks the dictionary again. Deploy also gets shared with full cycle lock until the containers stop. The first attempt 0.3.74 (34826776631) was canceled prior to server action to enable this protection; The final release and collection results are still being verified.


## Final acceptance 0.3.74
Runtime `5ce0976394b11b7d11f36eb982364c9cd36c8da9`, [deploy 34827238766](https://github.com/Tsyzhman/fantasy/actions/runs/34827238766) success. 1129 unit tests pass, lint 0 errors / 153 warnings, typecheck/build passed. The general lock guard is passed before the containers stop. The first full cycle completed 09:23:56 UTC, containers were updated after it.

[Browser 34839344376](https://github.com/Tsyzhman/fantasy/actions/runs/34839344376) success on test commit `5a0acf9`: auth pass, desktop/tablet/mobile passed. Mobile requested a retry due to 30-second timeout of initial navigation; total 2 pass + 1 flaky retry-pass. EP publish check now expects time-limited version 1 instead of assuming synchronicity with import. The final Excel was actually downloaded three times: 697 records, seven sheets, 1111242–1111244 bytes. Constantly unavailable forecast will still fail the check.

Server full cycle: current 695/695 profiles, failedProfiles=0; 1638 PLAYED / 955 DNP. Archive verified 695/695: 540 stories / 24238 matches played by players; 499 with official protocols. The result PARTIAL / exit 2 applies only to 16 HISTORY_IDENTITY_INVALID in the Sports archive and HTTP 403 current protocols. Calendar, catalog, current history, official archive data, line, EP and cleanup done. Timer remains enabled/active, the next launches are 20:00 and 10:00 MSK. Errors were not reset for the sake of green status.

Manual verification odds 11:40:24 UTC DONE: verifiedAt=11:40:24.166, lastSuccessAt=11:40:25.252. Automatic subsequent tick 11:42:34.512 updated lastSuccessAt, saved verifiedAt=11:40:24.166, matched=12. This confirms that the dictionary check timing in the running process has been fixed.

After two hours of work: web/worker healthy, restarts=0; raw 29 / 99987 bytes, duplicates stats/odds/raw/active jobs=0; v4 holds exactly 96 revisions, components 253918892 bytes, physical table 524 MB (without growth between the last two measurements); 85 GiB free. Web 153.4 MiB, shared worker 1.933 GiB, PostgreSQL 1.217 GiB. This is the memory of the entire worker with football tasks, not a separate hockey parser. 49 migrations applied, unfinished 0.
