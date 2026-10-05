# WI-049: Reconcile the KHL calendar with current Sports fantasy weeks

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Production calendar assignments follow current, agreeing Sports.ru observations from both clubs instead of retaining the first unverified week forever.

## Specs

- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#fantasy-weeks`
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#schema`
- Constraint: `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`
- Constraint: `spec://modules/khl/FEAT-001-khl-module-and-rules#root`

## Scope

- In: bounded club-calendar reconciliation, protected verified assignments, correction evidence and revision invalidation, hourly integration, immediate production reconciliation, regression and resource checks.
- Out: inferred week boundaries, optimizer readiness gates, archive identity failures, scoring, xG and football ingestion.

## Acceptance

- [ ] Reproduce a future match stuck in an older unverified week and verify a correction from agreeing club observations.
- [ ] Ambiguous, disagreeing, stale and unverified source identities cannot replace last-good assignments; verified assignments remain protected.
- [ ] Repeat import does not grow assignments or revisions; corrections invalidate the affected weeks and contest without changing statistics or official FP.
- [ ] Hourly collection refreshes club calendars independently of cached player histories and exposes a bounded source outcome.
- [ ] Focused tests, database regressions and release checks pass.
- [ ] Deploy the verified immutable release and verify the actual production calendar against Sports, including today's affected matches.
- [ ] Check cache bounds, duplicate jobs/facts, child-process cleanup and runtime memory after reconciliation.

## Result

In progress.
