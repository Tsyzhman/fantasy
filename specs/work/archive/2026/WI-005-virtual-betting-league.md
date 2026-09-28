# WI-005: Virtual Fantasy Betting League

- Kind: `change`
- Canon action: `new-spec`

## Outcome
The Fantasy server runs a mini-application with the Fonbet line, virtual balances of users and five algorithms, recommendations, bets and ratings.

## Specs
- Governing: `spec://modules/betting/FEAT-001-virtual-league#root`.
- Constraint: product boundaries specs/common/main.md and safe release docs/operations/DEPLOYMENT.md.
- Affected: `spec://modules/betting/FEAT-001-virtual-league#root`.

## Scope
- In: existing authorization, 100 000 coins for each participant, Mia/Abella/Lana/Riley/Adriana, line for downloaded leagues, recommendations before betting, pass, log, calculation, rating, migration and server release.
- Out: real money, payments, promises of profitability, changing unfinished WI-001/004.

## Acceptance
- [x] The line reflects Fonbet coverage and clearly communicates the calculation limitations.
- [x] The balance is issued once; Competitive rates and repeat requests do not create unnecessary charges or payments.
- [x] All five bots use different published strategies and may miss the event.
- [x] Recommendations are visible until the bet is confirmed; history and rating take into account open bets separately.
- [x] Authorization, blocking of old quotes/started matches, and idempotent calculation work.
- [x] Contract checks have been completed and the interface has been checked, secure deployment has been completed with revision/health confirmation.
- [x] Doubles, cache limitations and server memory have been checked.

## Result
The implementation is ready for server release. Isolated branch codex/virtual-betting-league from the current production 8c4835a; working directory C:/Users/Nik/Documents/fantasy_betting_league.


Tested before release: npm run check (1 019 pass, 1 regular skip, 0 fail; lint without errors, typecheck, build); separate PostgreSQL with 41 migration; competitive write-offs, network replays, 2,50/2,60 odds, payouts and journal; browser flow in light/dark theme and width 390; API auth/origin/JSON limits. Document: docs/guides/BETTING_ARENA.md. The deployment result will be added after the real health/revision smoke.


Production: https://fantasy.tsyzhman.ru/betting — v0.3.57, commit d9abf51dbc2a842b66484c644269987fd719d653, release 20260907T094424Z-v0.3.57-d9abf51. Workflow https://github.com/Tsyzhman/fantasy/actions/runs/34107206679 completed success. Health API, Docker labels of both containers and .release-commit are the same; web/worker healthy.

Verified backup: /var/backups/fantasy-scout/pre-20260907T094424Z-v0.3.57-d9abf51-migration.dump, SHA-256 6e1585a6dd4da8711a7c111710f487db909fc4c1876e0446d99fc052ae6fd1bd. Rehearsal restore/migration, 41 production migration, canary and switching completed.

Production smoke: 368 events, 46 loaded leagues, 33 accounts (28 users and 5 bots), synchronization without errors. Unmatched matches 77: clearly marked, no made-up recommendations, manual calculation. All starting transactions for 100 000, duplicate accruals/bot rates and journal discrepancies - 0. Five bots have reached the open risk limit 10 000 and are allowing new bets above the limit. The human verification bet was performed only on the test database, production was verified by reading. The temporary production session has been revoked.

Resources after launch: web 142 MiB, worker 1.002 GiB, PostgreSQL 985 MiB, available RAM 7.1 GiB, disk 20%. Test DB, migration rehearsal DB, canary and setup image have been deleted; The SSH tunnel and QA browser are closed, temporary access files are deleted. Reproduction and screenshots - specs/work/evidence/WI-005. Primary npm run check: 1 019 pass / 1 skip; after changing the choice of the calculation queue, the target DB tests, typecheck/build, were repeated; The regular GitHub deploy passed the entire check again.

The code was moved to the main working directory by the verified git apply without affecting neighboring unfinished changes. Arena's own specification is being snapshotted; subsequent notes from the main spec-space refer to the parallel WI-006, and in the isolated release to the not yet released WI-001. The next deploy must include production commit d9abf51.
