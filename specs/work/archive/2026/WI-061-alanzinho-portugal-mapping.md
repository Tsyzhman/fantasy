# WI-061: Restore Alanzinho to the Portugal player pool

- Kind: `fix`
- Canon action: `none`

## Outcome

The current Sports.ru Alanzinho price resolves to the existing Alan identity in Vitória de Guimarães and appears once in the Portugal player pool after refresh.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits`

## Scope

- In: provider/core identity verification, existing persistent manual mapping, bounded Portugal-only pool refresh, real cached reader verification and duplicate/memory checks.
- Out: new player identities, historical roster edits, lineup edits, transfers, changes to pricing or display design.

## Acceptance

- [x] Fresh Sports.ru price exists but the missing mapping prevents pool inclusion; primary sources confirm the same player and current team.
- [x] Existing manual mapping binds Sports player 75241 to core player 892751, team 7844, price 7, without conflicting duplicate identities.
- [x] The verified mapping survives the normal mapping refresh and the Portugal player-pool reader contains exactly one Alanzinho.
- [x] Current club limit remains two; saved squads, cache duplicates and memory are checked after repair.

## Dependencies

- Related: `WI-059`, `WI-060`, `WI-019`

## Result

Production data repaired 2026-10-09 15:23 UTC using the existing persistent mapping mechanism, without changing the deployed image. Before: the fresh current-season Sports.ru price had null player/team foreign keys and an UNMATCHED provider map; the core player Alan was already active in Vitória. After: price 75241 maps to 892751/7844 with MANUAL/MATCHED; normal autoMapSportsRuFantasyPlayers replay restricted to this row preserved the mapping. Exactly one price/player mapping exists and duplicate price/refresh keys are zero.

The existing Portugal-only pool builder published 616 players (previously 615), failed=[], and the real cached player reader returns one «Аланзиньо», Vitória de Guimarães, price 7. All 194 saved selections retain their exact hash; moved/refreshed/deleted selections are zero. Contest cap remains two. The separate repair process completed and disconnected, final RSS 818 MiB; serving web/worker are healthy with zero restarts/OOM and 5606 MiB host memory available.

Evidence: [repair](../../evidence/WI-061/repair.jsonl), [resources](../../evidence/WI-061/resources-after.txt), [identity](../../evidence/WI-061/identity.md).
