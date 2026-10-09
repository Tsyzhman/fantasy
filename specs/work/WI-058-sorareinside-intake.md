# WI-058: Repair rejected SorareInside XI ingestion

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Published XI for the affected clubs is ingested after verified identity and roster discrepancies are resolved, with the full-team validation and duplicate protection preserved.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#apply`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#runtime`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#recovery`

## Scope

- In: authenticated source inspection, current roster and identity evidence, verified Sports.ru name aliases, corroborated restoration of an existing inactive roster member, importer repair, regression checks, dry-run/apply on production, release and memory/cache/duplicate verification.
- Out: guessing ambiguous names, accepting partial XI, silently replacing stored provider IDs, unrelated data imports, sending additional Telegram messages, or editing user squads.

## Acceptance

- [ ] Reproduce the affected clubs' intake failures and identify the source/database discrepancies with bounded evidence.
- [ ] Correct verified identity/roster handling without weakening complete XI, goalkeeper, fixture, active membership or mapping-conflict checks.
- [ ] Regression checks cover the correction and rejection of conflicting/ambiguous identity data.
- [ ] Source dry-run and production apply prove full XI and fresh metadata for affected teams; repeat import does not create duplicate mappings or refresh requests.
- [ ] Release identity, memory, cache expiry and duplicate checks are verified and recorded.

## Dependencies

- Related: `WI-057`

## Result

In progress.
