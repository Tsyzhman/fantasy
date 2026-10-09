# WI-063: Audit and repair current player pools across all football leagues

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

Current football fantasy price lists, canonical identities, club rosters and user-visible player pools are reconciled across every available league; verified omissions and incorrect bindings are repaired durably, with explicit evidence for remaining source limitations.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`
- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`
- Existing Sports price contract: `docs/integrations/SPORTS_RU_FANTASY_SYNC.md`
- Deployment constraint: `spec://common/INFRA-006-continuous-deployment#root`

The full audit reproduced missing contract details for identity letter folding, birth-date preservation, fresh unique catalog identity evidence, durable explicit source-identity exclusions, provider/canonical name search, provider position taxonomy and FPL price-backed virtual roster availability. Clarify those existing player-pool responsibilities without changing shared starter flags or removing interface capabilities.

## Scope

- In: inventory of all current available football contests, complete price/identity/roster/pool audit, exact primary-source identity checks for corrections, durable fixes through existing guarded mechanisms, canonical identity repair for the same selected provider card without changing the user's choice, narrowly scoped code corrections if a reproduced common cause warrants them, normal refresh persistence, real reader and cache/duplicate/memory verification.
- Out: invented prices or identities, historical competitions, user lineup or transfer edits, Telegram delivery, weakening identity conflict checks, unrelated UI redesign.

## Acceptance

- [ ] Every current available football league/provider is inventoried; every current priced row has an audited mapping, club/roster and pool-inclusion disposition.
- [ ] Verified missing or incorrect players are repaired without conflicting identity or current-club assignments; ambiguous/source-limited cases are explicitly recorded.
- [ ] Reproduced recurring technical causes are corrected durably and appropriate regression checks pass; actual normal refresh preserves accepted mappings.
- [ ] All affected current player pools are republished sequentially and real readers confirm repaired players exactly once at the current source price.
- [ ] Saved squads, provider rules and interface capabilities are preserved; cache retention, duplicates, process exit and serving memory are checked before/during/after.
- [ ] Any required release is promoted using the continuous production workflow and verified against its exact revision.

## Dependencies

- Related: `WI-019`, `WI-058`, `WI-061`, `WI-062`

## Result

Implementation verified; production reconciliation remains in progress. The complete baseline covers 13 current contests and 9,159 prices. Primary FotMob profiles were checked for 6,882 catalog identities plus 42 explicit candidate identities. Normal source refresh repaired 50 mappings while preserving all 145 saved squads and 2,162 selections. Oso was separately linked to Sports.ru's Joaquín Martínez Gauna entry and verified exactly once through the real France pool readers at price 5.5.

Regression checks: 125 focused tests passed; full suite 1,298 passed and two platform skips; lint has zero errors. Verified wrong identities and stale manual club locks will be corrected after the immutable release protects retained birth dates, then all affected pools will be republished and audited again. Evidence: `evidence/WI-063/verification.json`.
