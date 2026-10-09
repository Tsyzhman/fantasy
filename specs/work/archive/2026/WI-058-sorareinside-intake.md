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

- In: authenticated source inspection, current roster and identity evidence, refreshing stale Sports.ru prerequisite data in France/Germany/UCL, a bounded price-write timeout for recurring refreshes, verified Sports.ru name aliases and operator-reviewed nickname bindings, corroborated restoration of an existing inactive roster member, importer repair, regression checks, dry-run/apply on production, release and memory/cache/duplicate verification.
- Out: guessing ambiguous names, accepting partial XI, silently replacing stored provider IDs, unrelated data imports, sending additional Telegram messages, or editing user squads.

## Acceptance

- [x] Reproduce the affected clubs' intake failures and identify the source/database discrepancies with bounded evidence.
- [x] Correct verified identity/roster handling without weakening complete XI, goalkeeper, fixture, active membership or mapping-conflict checks.
- [x] Regression checks cover the correction and rejection of conflicting/ambiguous identity data.
- [x] Source dry-run and production apply prove full XI and fresh metadata for affected teams; repeat import does not create duplicate mappings or refresh requests.
- [x] Release identity, memory, cache expiry and duplicate checks are verified and recorded.
- [x] Corroborating price batches complete within their explicit bounded deadline, including Spain's reproduced startup timeout.

## Dependencies

- Related: `WI-057`

## Result

- Reproduced 11 rejected full-XI scopes and refreshed three stale corroborating price scopes. Verified full-name/birth-date matching and atomic restoration of existing inactive members while retaining complete-XI, goalkeeper, fixture, active-membership and provider-conflict guards.
- Added 37 focused regression checks and two database scenarios; final CI passed 1,284 tests, 25 database tests, production dependency audit, lint, TypeScript and build. Workflow validation passed; material spec snapshot is current with no diagnostics.
- Released 0.3.125 through PR #44 / deploy 37912544049, resolved all 11 original rejections and verified the Fiorentina Pote/Pedro Goncalves UUID against primary identity evidence before an atomic operator binding. All 14 control scopes have a full active XI with one goalkeeper and fresh future-fixture metadata.
- Reproduced Spain's recurring price-write cancellation at 5,151 ms against the 5,000 ms default. Released the bounded 60-second write budget as 0.3.126 through PR #45 / deploy 37920735721. All seven recurring scopes completed: 4,703 prices, no failures and no saved-selection changes.
- The production repeat has zero player-mapping, apply or mapping-conflict errors; all 14 control fingerprints are retained with fresh metadata. Three newly published XI for other clubs were applied; two new exact-name UUID bindings are unique. Source coverage remains PARTIAL for five absent forecasts, 19 absent team/match assignments and Bodo/Glimt's six-player response; these do not replace a valid complete XI.
- Public health, web/worker labels and release manifests agree on source commit 2bd70d9d930f414c9bc223bedf17385f0157dfc4 and tree 58f445c0b2240950e13b362f695d6adca3fa7b3c; main merge c075e83837bdcea55de1f858f9ce33449b20fa2d preserves that tree and source history.
- Six duplicate checks and expired raw-cache rows are zero. Both processes are healthy with no restarts/OOM; host has 5,538 MiB available, two releases retained and no canaries. No additional Telegram messages were sent by this work item. Evidence: `specs/work/evidence/WI-058/verification.json` and linked pass reports. Recovery snapshots are retained.
- REVIEW: none. TECHDEBT: none.
