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

- In: early schedule scoping by the existing current priced club catalog, exact source identities and reviewed aliases; current Europa League club-name reconciliation; regression tests; bounded production dry-run, release and refreshed forecast verification; cache, duplicates and memory checks.
- Out: unrelated club forecasts, national teams, changing saved squads, guessing player identities, incomplete XIs or narrowing relevant clubs to one competition.

## Acceptance

- [ ] Regression reproduces the unrelated sparse Santos record and proves it cannot abort a relevant-club cycle.
- [ ] All competitions and the nearest fixture without a forecast remain eligible for each relevant club; invalid relevant data still fails closed.
- [ ] Production club scope is passed before schedule parsing; reviewed current Europa League aliases resolve uniquely.
- [ ] Focused tests, lint/typecheck, required CI and immutable release checks pass.
- [ ] Production completes a scoped import, publishes the accepted XIs and preserves saved squads; remaining source limitations are recorded explicitly.
- [ ] Final cache retention, duplicate/job counts, memory and production health are verified.

## Result

In progress.
