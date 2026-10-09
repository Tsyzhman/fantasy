# WI-059: Preserve two players per club in four Sports.ru leagues

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Turkey, Championship, Netherlands and Portugal allow two players from one club; the third is rejected and refreshes retain the correct limit.

The user explicitly corrected the initial request on 2026-10-09: these four leagues require two. Release 0.3.127 had already raised the limit to three; restore the live values and retain its applied migration unchanged in history.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits`
- Constraint: `spec://modules/machete/FEAT-003-squad-player-card#root`

## Scope

- In: four explicit league limits, current-season persisted contests, stale snapshot rules at read time, manual selection/validation regressions, immutable production release, cache/duplicates/memory verification.
- Out: changing other competitions, historical contest rules, player data, saved squads or transfer quotas.

## Acceptance

- [ ] Record the initial two-player limits and the already deployed three-player change before restoring the user's corrected requirement.
- [ ] Configuration/import defaults and current-season contests use two in all four leagues.
- [ ] Manual selection allows the second and rejects the third; old cached metadata follows the current contest limit without rewriting player payloads.
- [ ] Regression and required release checks pass; immutable production identity and real stored/snapshot read rules are verified.
- [ ] Cache, duplicates and memory are checked without changing user lineups.

## Dependencies

- Related: `WI-024`, `WI-058`

## Result

In progress.
