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
- Governing: `spec://common/structure#release-transport`

## Scope

- In: bounded persistent cycle status, accurate success timestamp, shared header on all KHL views, lightweight status polling, contract tests, versioned immutable production release with bounded dependency downloads and SSH keepalive, cache/duplicate/memory verification.
- Out: source ingestion schedules, xG availability, scoring, squad actions, historical backfill.

## Acceptance

- [ ] Header displays server catalog date/time and full successful refresh date/time in Moscow time, with explicit unknown values.
- [ ] Last attempt distinguishes success, source errors, pending batches, active and interrupted refreshes; failures preserve the prior successful timestamp and last completed attempt.
- [ ] Only a complete `DONE` cycle advances the full-success timestamp; legacy `PENDING` records are not presented as a full success.
- [ ] Contract tests, lint, typecheck and production build pass; existing KHL flows remain available.
- [ ] Exact committed revision is pushed and deployed through the immutable production workflow; live status API and desktop/mobile header are verified.
- [ ] Bounded status storage, duplicate jobs/facts, runtime memory and release/cache retention are checked after rollout.

## Result

Implementation prepared as 0.3.105 and published to main in `864326cd22aed8c556bec411d04c38f086aa5681`. Seven focused state/SSR contracts pass; the full local check passes (1208 passed, two skipped; lint has warnings and no errors), typecheck/build pass, and the production dependency audit reports zero vulnerabilities. GitHub Check 36410593507 passes. First deploy rejected the shortened commit ref; the corrected deploy 36410793317 lost its SSH connection while the remote dependency build was still running. That process has ended; production remained healthy on 0.3.97 and no duplicate promoter was started. The final candidate adds SSH keepalive and bounded npm fetch retries. Live verification remains pending.
