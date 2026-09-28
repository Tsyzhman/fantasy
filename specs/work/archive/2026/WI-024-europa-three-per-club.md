# WI-024 – Three players from one club in the Europa League

Kind: fix
Canon action: none

## Outcome
You can select up to 3 players from the same club in the Europa League Squad; the fourth is prohibited.

## Specs
- Governing (registered legacy): docs/integrations/SPORTS_RU_FANTASY_SYNC.md
- Constraint: spec://modules/machete/FEAT-003-squad-player-card#root
- Related: WI-016

## Scope
In: explicit limit league 73, persisted contest of the current season, regression, production.
Out: other tournaments, user lineups, historical seasons.

## Acceptance
- [x] Europa League has a limit of 3 in fallback and current contest; resynchronization saves 3.
- [x] General manual selection/validation/auto-selection uses the rule 3; the fourth player is prohibited.
- [x] Checks and production are completed.

## Result
- Was: league 73=2 in the general table and the current contest. Now: 3 in configuration and database; current price loaders use a common table. Migration is limited to SPORTS_RU / 73 / 2026/2027, other limits have been verified without changes.
- Manual selection and general validation: the third is allowed, the fourth is rejected (regression). Auto-selection uses the same rules.
- Local: focused tests 53 passed; full set 1130 passed / 1 skipped; lint 0 errors; typecheck and production build passed.
- Production 0.3.75, commit `571946036223be2689bebff730bed8a19273ab5e`, release `20260916T152502Z-v0.3.75-5719460`. GitHub Actions has reached its artifact quota; the release went through the same immutable archive and `deploy-production-docker.sh` via SSH Host `deploy`. Migration applied; `/api/health` status ok with exact commit; symlink and image labels are the same.
- Contest: `73/2026/2027` = 3, `42/2026/2027` remains 3. web/worker healthy, restarts=0. Evidence: `specs/work/evidence/WI-024/production.md`.
