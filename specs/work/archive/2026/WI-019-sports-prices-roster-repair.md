# WI-019: Sports prices and activity of missed players

- Kind: `migration`
- Canon action: `none`

## Outcome
Prices for all current Sports club tournaments have been updated in production; players previously missed by SorareInside with a confirmed current price are activated in the corresponding roster.

## Specs
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`.
- Constraint: `docs/integrations/SPORTS_RU_FANTASY_SYNC.md`, existing Sports-authoritative activation script in starter route; direct indication from the user: the availability of the current Sports price determines the activity.

## Scope
- In: regular import of 11 current club tournaments, check of nine cases, spot activation/confirmed ID mapping, re-import of the base, check of cache/duplicates/memory.
- Out: change of product code, mass activation of remaining players, archived World Cup.

## Acceptance
- [x] All 11 tournaments have been imported with a report.
- [x] Checked prices and rosters of nine previously missed players before/after.
- [x] Confirmed cases have been corrected without duplicates or identity substitution.
- [x] SorareInside reload and cache update verified.
- [x] Memory and temporary artifacts have been checked, evidence has been saved.

## Result
Production 0.3.68, without changing the runtime code. Standard Sports import completed 2026-09-11 13:35:20–13:36:25 UTC: 11/11 SYNCED tournaments, 7361 price records, 15 obsolete ones were deleted by the standard mechanism. The archived World Cup was not affected.

There were: seven inactive roster entries, including El Shaarawy's unattached price; two active players without SorareInside matches. Now: all nine are active in the required rosters, seven corrected entries have source=sports.ru; El-Shaarawy price was compared using standard manual mapping; Silyanov and Gnangoro received verified permanent SorareInside IDs. The remaining rosters were not activated. Sports-authoritative activation and cleaning of someone else's club repeats the existing starter route; checkbox/roster changes and cache queries are atomic under the same locks. Saved custom lineups were not changed.

Repeated SorareInside --apply 13:38:42–13:41:57 UTC: 12 APPLIED, 207 UNCHANGED, 0 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 SOURCE_ERROR. In all 219 processed squads there are exactly 11 active checkmarks and an exact match with the forecast ID. El Shaarawy is activated, but by the time of re-import SorareInside had already removed it from the forecast basis; its checkbox is correctly disabled. All nine previously missed commands have been processed.

Complete cache recalculation after import: 11/11 snapshots, 6989 players, failed=[], 78.8 s; There are 3 of regular audits left for the tournament, the queue is empty. There are no reverse duplicates of SorareInside mapping. 8 existing regression/contract tests for Sports-authoritative activation and saving during FotMob cleanup passed. Memory importer maximum 186 MiB, repair 75 MiB, Sorare CLI 143 MiB, complete separate cache builder RSS 1.528 GiB and completed; shared worker after completion of 1.163 GiB. Temporary scripts/bundles/reports removed after saving limited evidence.

Evidence: [before](../../evidence/WI-019/before.json), [price import](../../evidence/WI-019/prices.jsonl), [corrections](../../evidence/WI-019/repair.jsonl), [identity check](../../evidence/WI-019/identity-review.md), [re-SorareInside](../../evidence/WI-019/sorare-after.json), [after](../../evidence/WI-019/after.json), [cache](../../evidence/WI-019/cache.json). The remaining seven passes do not relate to player activity.
