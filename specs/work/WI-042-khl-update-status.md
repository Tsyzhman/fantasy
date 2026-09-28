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

Production 0.3.106 is installed from `fee7a1812ac69bef9670cc8d5b4ca99aaf848a8e`; GitHub Check 36413266512 and Deploy Production 36413358965 pass. Health, OCI labels and the current-release manifests agree on that revision. Web and worker are healthy with zero restarts.

Seven focused state/SSR contracts pass; the full local and release checks pass (1208 passed, two skipped; lint has warnings and no errors), typecheck/build pass, and the production dependency audit reports zero vulnerabilities. The status checkpoint was observed running with schema version 2, preserving the previous partial attempt. Raw payloads, player-match facts and active jobs have no duplicate groups. The failed 0.3.105 candidate was removed after checking its exact path, commit and lack of runtime references; current and rollback releases remain.

The first live browser run (36414268404) logged in successfully but failed on an obsolete football heading in the shared authentication setup. Assertions now accept the actual Russian/English heading; scoped lint and typecheck pass. Desktop/tablet/mobile verification is being repeated. Two invalid traceability references to the technical map were removed; it remains linked as documentation rather than a typed governing specification.

Earlier release attempts rejected a shortened commit ref and lost an SSH connection during a dependency build. Production stayed on its previous healthy release until a full revision was promoted; the final transport uses SSH keepalive and bounded npm fetch retries. No duplicate promoter was started.
