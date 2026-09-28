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

- [x] Header displays server catalog date/time and full successful refresh date/time in Moscow time, with explicit unknown values.
- [x] Last attempt distinguishes success, source errors, pending batches, active and interrupted refreshes; failures preserve the prior successful timestamp and last completed attempt.
- [x] Only a complete `DONE` cycle advances the full-success timestamp; legacy `PENDING` records are not presented as a full success.
- [x] Contract tests, lint, typecheck and production build pass; existing KHL flows remain available.
- [x] Exact committed revision is pushed and deployed through the immutable production workflow; live status API and desktop/mobile header are verified.
- [x] Bounded status storage, duplicate jobs/facts, runtime memory and release/cache retention are checked after rollout.

## Result

The shared panel on squad, players and calendar reports server catalog publication, the last full success, the latest completed attempt and source failures in Moscow time. Running and interrupted states preserve previous evidence. Visible-page polling is limited to one request per minute; a failed request leaves the last known result visible. Legacy pending attempts never become a fictitious full success.

Production was verified on 0.3.106 from `fee7a1812ac69bef9670cc8d5b4ca99aaf848a8e`: [Check](https://github.com/Tsyzhman/fantasy/actions/runs/36413266512) and [Deploy Production](https://github.com/Tsyzhman/fantasy/actions/runs/36413358965) pass. Health, OCI labels and current-release manifests agree; web and worker are healthy with zero restarts. The concluding 0.3.107 changeset retains identical application files, corrects browser assertions and records evidence. The immutable promotion workflow retains the release archive, checksum and exact production revision verification.

Validation: seven focused state/SSR contracts; full local and release checks (1208 passed, two skipped, zero failures); lint with warnings and no errors; successful typecheck/build; zero production dependency vulnerabilities. [Production Browser Smoke 36415891583](https://github.com/Tsyzhman/fantasy/actions/runs/36415891583) passes authentication and six desktop/tablet/mobile checks, including all three views, no horizontal overflow, private/no-store status responses, bounded sanitized source details, retained timestamps on a polling failure, statistics/history, forecast cards, roster controls and Excel. The shared setup now checks the actual protected planner rather than a removed heading; card coverage is compared with the selected five-match history window.

The manual and hourly collectors persisted schema version 2. Running state retained the previous partial attempt; the scheduled cycle completed at `2026-09-28T11:22:16.827Z` with ten sources and the existing `Sports: прошлый сезон` failure. It is shown as partial, with no provable full-success timestamp. Source repair remains outside this WI.

Post-rollout checks found one bounded daily checkpoint (2381 bytes), 160 compressed raw rows (2309948 bytes), and zero duplicate raw groups, player-match facts or active jobs. The failed 0.3.105 source directory was removed after exact path/commit/runtime-reference checks; current and rollback releases remain, without extra canaries or collectors. Under browser load web used 576.8 MiB, worker 1.174 GiB and PostgreSQL 1.288 GiB, with 6260 MiB host memory available. These are workload snapshots after a restart, not proof that unrelated memory growth was repaired. Reclaimable Docker build cache was 995.9 MB after the configured 1 GB pruning policy. Local Next cache remains 1291529918 bytes: automatic approval review rejected its deletion as `blocked by policy`; no local Next/test process remained.

Spec snapshot is current with no diagnostics and fingerprint `dc94b58416474613afa8128fcf62af41ca4ebe571f76492943440401ce00f717`. The technical map documents release transport; invalid typed references to that map were removed. Earlier deployment failures (short ref and disconnected dependency build) did not replace production or create duplicate promoters; keepalive and bounded dependency retries are included in the successful release. Sanitized details are in [release evidence](../../evidence/WI-042/release.json). No new REVIEW or TECHDEBT was introduced.
