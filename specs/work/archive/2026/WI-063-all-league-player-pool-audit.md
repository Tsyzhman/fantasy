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

- [x] Every current available football league/provider is inventoried; every current priced row has an audited mapping, club/roster and pool-inclusion disposition.
- [x] Verified missing or incorrect players are repaired without conflicting identity or current-club assignments; ambiguous/source-limited cases are explicitly recorded.
- [x] Reproduced recurring technical causes are corrected durably and appropriate regression checks pass; actual normal refresh preserves accepted mappings.
- [x] All affected current player pools are republished sequentially and real readers confirm repaired players exactly once at the current source price.
- [x] Saved squads, provider rules and interface capabilities are preserved; cache retention, duplicates, process exit and serving memory are checked before/during/after.
- [x] Any required release is promoted using the continuous production workflow and verified against its exact revision.

## Dependencies

- Related: `WI-019`, `WI-058`, `WI-061`, `WI-062`

## Result

Completed on the serving 0.3.130 release, exact commit 39e65c199a331751f9d7ce12d65d35810531da79. Every current priced row has a recorded identity/club/roster/pool disposition: 13 contests, 9,159 prices, 36,927 canonical players and 11,362 roster rows. Primary evidence covers 219 current club rosters (6,371 members) and 7,353 profiles; two profile endpoints were unavailable and are recorded.

Restored 395 previously missing cards: unresolved rows decreased from 486 to 91. Corrected 13 wrong canonical bindings, 24 stale manual club locks and 7 selected canonical references for the same Tommaso Macchioni provider cards previously bound to Mancini. Restored 7,189 verified birthdays and corrected one birthday using the official Villarreal record. No selected card was removed; provider card choices, captain/slot settings and all 145 squads with 2,162 selections were preserved.

Normal refresh retained accepted mappings and the reviewed conflicting-source exclusion. All 12 Sports pools were published sequentially (8,399 players); the real FPL reader returned all 667 mapped players. Real cached/full-set/base readers verified all 9,066 mapped prices exactly once with matching source price, club and provider identity. Oso, Frederik Rønnow and Аланзиньо are present and searchable. Club caps remain two in Turkey, Championship, Netherlands and Portugal.

CI for the deployed revision passed 1,301 unit tests, 25 database integration tests, lint (zero errors, 236 existing warnings), typecheck, migration drift, dependency audit and build. A source-exclusion regression reproduced the old behavior and passes after the fix. A Windows performance threshold missed under concurrent lint/typecheck load; isolated retry passed under 6.1 seconds, and the full Linux CI suite passed.

Continuous deployment started and verified a second immutable version, reloaded Caddy gracefully, drained requests and retained the prior version for rollback. Web and worker have the exact same verified image, zero restarts and no OOM termination; Caddy PID stayed 754. Cache retains three READY revisions per scope; duplicate prices/canonical claims/maps/pool rows/saved selections and orphan pool rows are zero, refresh queue is empty and raw-cache expired rows are zero. Temporary children exited and released native memory; final host availability was about 6 GiB.

Source limitations are explicit: 91 unmatched cards, 34 retained provider birthday discrepancies, two unavailable profiles and one existing Cyrillic Sports-backed identity not scored by the Latin matcher. No identities, source prices, statistics or shared starter flags were invented. Evidence and per-row dispositions: [report](../../evidence/WI-063/report.md), [verification](../../evidence/WI-063/verification.json), [all prices](../../evidence/WI-063/price-dispositions.csv).
