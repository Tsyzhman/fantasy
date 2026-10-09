# WI-059: Restore three players per club in four Sports.ru leagues

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Turkey, Championship, Netherlands and Portugal allow three players from one club; the fourth is rejected and refreshes retain the correct limit.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits`
- Constraint: `spec://modules/machete/FEAT-003-squad-player-card#root`

## Scope

- In: four explicit league limits, current-season persisted contests, stale snapshot rules at read time, manual selection/validation regressions, immutable production release, cache/duplicates/memory verification.
- Out: changing other competitions, historical contest rules, player data, saved squads or transfer quotas.

## Acceptance

- [ ] Reproduce the wrong limit in configuration and production; retain a bounded pre-change record.
- [ ] Configuration/import defaults and current-season contests use three in all four leagues.
- [ ] Manual selection allows the third and rejects the fourth; old cached metadata follows the current contest limit without rewriting player payloads.
- [ ] Regression and required release checks pass; immutable production identity and real stored/snapshot read rules are verified.
- [ ] Cache, duplicates and memory are checked without changing user lineups.

## Dependencies

- Related: `WI-024`, `WI-058`

## Result

In progress.
