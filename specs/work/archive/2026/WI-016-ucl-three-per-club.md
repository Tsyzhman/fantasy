# WI-016 - Three players from one club in the Champions League

Kind: fix
Canon action: none

## Outcome
In the Champions League Squad, you can select up to 3 players from the same club; the fourth is prohibited.

## Specs
- Governing (registered legacy): docs/integrations/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root

## Scope
In: explicit limit league42, persisted contest of the current season, regression, production.
Out: other tournaments, user lineups, historical seasons.

## Acceptance
- [x] Champions League has a limit of 3 in fallback and the current contest; resynchronization saves3.
- [x] General manual selection/validation/auto-selection use rule3; the fourth player is prohibited.
- [x] Checks and production have been completed, cache/memory has been checked.

## Result
- Was: league42=2 in the general table and the current contest. Now: 3 in configuration and database; current price loaders use a common table. Migration is limited to SPORTS_RU / 42 / 2026/2027, other limits have been verified without changes.
- Manual selection and general validation: the third is allowed, the fourth is rejected (regression). Auto-selection uses the same rules; existing optimizer tests pass.
- npm run check: 1087 passed, 1 skipped; lint, typecheck and production build passed. Focused tests: 51 passed.
- Production 0.3.66, commit 92f3731f120efb0ea3869eb13d0226f1f1f820c3; workflow 34246570454 success. Migration finished; /api/health status ok with exact commit; release symlink matches.
- Champions League: 1027 lines / 1027 unique players / 944 FFO. READY snapshots: 3. After launching web 125.7 MiB, worker 1.081 GiB, PostgreSQL 448.8 MiB. Additional worker processes were not launched for the fix.
