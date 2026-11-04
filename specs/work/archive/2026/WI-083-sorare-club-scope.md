# WI-083: Scope SorareInside ingestion to current fantasy clubs

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Current fantasy clubs receive their nearest-match forecasts without unrelated source clubs aborting the import.

## Specs

- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#source`
- Governing: `spec://modules/machete/INFRA-004-sorareinside-starters#mapping`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#apply`
- Constraint: `spec://modules/machete/INFRA-004-sorareinside-starters#recovery`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: early schedule scoping by the existing current priced club catalog, exact source identities and reviewed aliases; current Europa League club-name reconciliation; regression tests; bounded production dry-run, release and refreshed forecast verification; resolving the mandatory production dependency audit blocker with a compatible ExcelJS transitive matcher update; cache, duplicates and memory checks.
- Out: unrelated club forecasts, national teams, changing saved squads, guessing player identities, incomplete XIs or narrowing relevant clubs to one competition.

## Acceptance

- [x] Regression reproduces the unrelated sparse Santos record and proves it cannot abort a relevant-club cycle.
- [x] All competitions and the nearest fixture without a forecast remain eligible for each relevant club; invalid relevant data still fails closed.
- [x] Production club scope is passed before schedule parsing; reviewed current Europa League aliases resolve uniquely.
- [x] Focused tests, lint/typecheck, required CI and immutable release checks pass.
- [x] Production completes a scoped import, publishes the accepted XIs and preserves saved squads; remaining source limitations are recorded explicitly.
- [x] Final cache retention, duplicate/job counts, memory and production health are verified.

## Result

Released 0.3.148 / `ef9830df24a8696494f857f0eb8ccf8654573730` through the canonical immutable promoter in successful deploy run `41801855649`. Public health, web and worker agree on the exact revision. The prior release remains available for rollback. The continuity monitor recorded 426 successful observations with zero failures, including 147 observations of the new revision.

The original parser failed the reproduced unrelated sparse Santos fixture regression. Early scoping now discards unrelated fixture metadata and never requests foreign XIs; relevant clubs still consider every competition and choose their nearest fixture before checking prediction availability. A second regression verifies that an irrelevant opponent's omitted country does not create a false duplicate conflict, while changed opponents and conflicting required data still fail closed. Reviewed club aliases resolve all 36 current Europa League clubs.

All 38 focused Sorare checks pass. Full Check `41801859868` passed 1,344 unit and 32 database tests, production dependency audit, migration drift, lint/typecheck/build and deployment/runtime checks. The final production dry-run completed without writes at 08:46 UTC. Startup then applied 35 changed scopes globally and confirmed 118 unchanged. The explicit repeat applied zero changes and confirmed all 153 valid scopes unchanged, including all 27 accepted Europa League XIs, with zero apply or mapping-conflict errors.

The published Europa pool contains 1,134 players; 1,105 comparable starter flags match the active roster, the source revision agrees, all 27 fresh forecast records match their persisted source identities, and both mismatch lists are empty. Refresh queue, duplicate pool keys and duplicate Sorare mappings are zero. Retention is three READY revisions per scope and two release directories; source transport archives are gone. All 150 saved squads and 2,237 selections retain their exact before/after hashes. Web/worker remain healthy with zero restarts/OOM. Settled web/worker memory is 476.6 MiB / 1.567 GiB, with 5,430 MiB host memory available; the transient full-refresh working set was released.

The mandatory audit exposed GHSA-g3hv-75wg-m249 in ExcelJS's transitive matcher. A scoped patched 11.0.1 matcher and tested legacy glob adapter preserve archive matching, ignores and XLSX round trips; the production audit has zero findings. The frozen lock was generated/validated with CI's npm 11.19.0, retaining Linux optional dependencies. Earlier attempts stopped before promotion. No migration, UI change or saved-selection write was introduced.

Automatic permission review rejected deletion of 494,166,364 bytes of task-local generated dependency/npm caches with `blocked by policy`; these files remain in ignored `.tmp/WI-083/`. Temporary diagnostic processes were stopped. The limited pre-apply recovery snapshot remains in ignored `backups/WI-083/`.

REVIEW: six Europa clubs have no published nearest-match forecast, and the source contains only 3/3/4 players for Lillestrøm/Levski/Viktoria. Prior flags are preserved. Other competitions retain four missing-match/team assignments and five player-identity gaps; partial source coverage is not reported as complete. TECHDEBT: none. Evidence: [verification](../../evidence/WI-083/verification.json), [publication](../../evidence/WI-083/publication.json), [continuity](../../evidence/WI-083/continuity.json), [resources](../../evidence/WI-083/resources.json).
