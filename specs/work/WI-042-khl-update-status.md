# WI-042: Show KHL update dates and the latest refresh outcome

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

KHL visitors can see when server data was refreshed and whether the latest attempt completed, failed, is pending, or was interrupted; the verified change is published to GitHub and production.

## Specs

- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status`
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#api`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#layout`
- Constraint: `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`

## Scope

- In: bounded persistent cycle status, accurate success timestamp, shared header on all KHL views, lightweight status polling, contract tests, versioned immutable production release, cache/duplicate/memory verification.
- Out: source ingestion schedules, xG availability, scoring, squad actions, historical backfill.

## Acceptance

- [ ] Header displays server catalog date/time and full successful refresh date/time in Moscow time, with explicit unknown values.
- [ ] Last attempt distinguishes success, source errors, pending batches, active and interrupted refreshes; failures preserve the prior successful timestamp and last completed attempt.
- [ ] Only a complete `DONE` cycle advances the full-success timestamp; legacy `PENDING` records are not presented as a full success.
- [ ] Contract tests, lint, typecheck and production build pass; existing KHL flows remain available.
- [ ] Exact committed revision is pushed and deployed through the immutable production workflow; live status API and desktop/mobile header are verified.
- [ ] Bounded status storage, duplicate jobs/facts, runtime memory and release/cache retention are checked after rollout.

## Result

Implementation prepared as 0.3.105. Seven focused state/SSR contracts pass; the full local check passes (1208 passed, two skipped; lint has existing warnings and no errors), typecheck/build pass, and the production dependency audit reports zero vulnerabilities. Spec snapshot is current with no diagnostics. Publishing and live verification remain pending.
