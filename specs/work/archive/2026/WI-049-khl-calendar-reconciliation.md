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

- [x] Reproduce a future match stuck in an older unverified week and verify a correction from agreeing club observations.
- [x] Ambiguous, disagreeing, stale and unverified source identities cannot replace last-good assignments; verified assignments remain protected.
- [x] Repeat import does not grow assignments or revisions; corrections invalidate the affected weeks and contest without changing statistics or official FP.
- [x] Hourly collection refreshes club calendars independently of cached player histories and exposes a bounded source outcome.
- [x] Focused tests, database regressions and release checks pass.
- [x] Deploy the verified immutable release and verify the actual production calendar against Sports, including today's affected matches.
- [x] Check cache bounds, duplicate jobs/facts, child-process cleanup and runtime memory after reconciliation.

## Result

Completed on 2026-10-05. Production release `0.3.118`, immutable commit `f2dd8fdfa6d270c799381cb1ed68e6b53fb97243`, is healthy in both web and worker. [PR #38](https://github.com/Tsyzhman/fantasy/pull/38) contains the calendar change above the current production branch.

Before: the first unverified week was retained on a conflict. After: fresh, uniquely matched observations from both clubs agree before an atomic correction, while verified assignments remain protected. The live pass read 22 club cards and corroborated 110 matches: 15 corrections, 95 unchanged, no deferred observations. Five games on 5 October moved 4 → 5, six on 12 October moved 5 → 6, and four on 19 October moved 6 → 7. It cleared 709 obsolete week-conflict diagnostics for active profiles.

The repeat live pass made zero corrections; all 15 correction revisions and affected-week versions stayed unchanged. The database regression additionally verifies that this importer does not advance the contest revision on a no-change pass; other live collectors independently advance that global version. All 7,952 statistic rows and 4,987 official fantasy-point rows retain the baseline content hashes.

Validation: 12 focused tests; [CI](https://github.com/Tsyzhman/fantasy/actions/runs/37287416849) passed 1,236 unit tests and 16 isolated database tests with no skips, audit, migration drift, TypeScript and build. Lint has zero errors and 234 existing warnings. The [canonical deployment](https://github.com/Tsyzhman/fantasy/actions/runs/37288135101) and [production browser checks](https://github.com/Tsyzhman/fantasy/actions/runs/37289411672) passed: authentication plus six KHL checks across desktop, tablet and mobile. The scheduled 12:22 MSK cycle completed its new calendar step with zero corrections/deferred observations and all eleven source outcomes persisted.

Resource checks: raw cache 909 rows / 12.66 MiB, below the 250 MiB cap, zero expired payloads; zero duplicate stat, FP, catalog, raw or active-job groups; zero pending/running KHL jobs. Calendar and hourly HTTP child processes exited. After browser checks, web used 551 MiB, worker 1.148 GiB and PostgreSQL 1.382 GiB; host available memory 6,444 MiB, disk 70 GiB. Both apps remain healthy with zero restarts/OOM. These are observed snapshots, not a memory-leak proof.

Existing limitations remain outside this change: the overall hourly status is `PARTIAL` solely because 16 previous-season Sports profiles fail identity validation. All eight exact week intervals remain unverified; optimizer readiness gates are preserved. No new compromise or REVIEW was introduced.

Evidence: [baseline](../../evidence/WI-049/baseline.json), [verification and correction provenance](../../evidence/WI-049/verification.json). Spec snapshot is `current`, diagnostics empty, fingerprint `358cae0efa59a28b5e14e398fcf44ddff1d98226a702479b19f138218b369ea3`.
