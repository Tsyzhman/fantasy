# WI-052: Restore the scheduled production smoke on main

- Kind: `fix`
- Canon action: `none`

## Outcome

The default branch passes GitHub Check and the production browser smoke with patched compatible dependencies, the deployed KHL eleven-source contract and assertions bound to each view's loaded catalog snapshot.

## Specs

- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#table`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#cards`
- Constraint: `spec://modules/khl/FEAT-002-khl-squad#layout`
- Constraint: `spec://common/structure#root`

## Scope

- In: reproduce the scheduled GitHub failure, align assertions with the actual browser catalog snapshot and canonical unavailable-forecast state, patch the two subsequently exposed production dependency vulnerabilities, verify the correction in PR #38, align the default branch with the reviewed correction and its existing PR dependency, validate GitHub checks and runtime resource bounds.
- Out: new application behavior, changes to the transfer-trends or workflow-validator tasks, production deployment, data resets.

## Dependencies

- Related: `WI-049`
- Existing correction: PR #38, based on PR #37.

## Acceptance

- [x] The failed scheduled run and its exact obsolete assertion are identified.
- [x] The full rerun exposes and records the additional forecast-publication and stale-snapshot failures.
- [x] The updated Check reproduces the sharp/source-map-js audit failures and supported upstream fixes are reviewed.
- [x] Compatible dependency patches resolve the audit failures; native image processing, source-map behavior and the full build pass.
- [x] Revised smoke verifies published formulas or explicit unavailable states and compares statistics with the displayed snapshot without fixed waiting periods.
- [x] The full production browser smoke passes on the corrected remote revision.
- [x] The correction reaches main with the necessary merge authorization.
- [x] GitHub Check and the full production browser smoke pass on main.
- [x] Cache bounds, duplicate rows/jobs and runtime memory are checked after verification.

## Result

Completed on 2026-10-07 (Europe/Moscow). Main `4606fb1f1f3988ab6d2360cfc6ff5b74bf66d813` passes [Check 37531199480](https://github.com/Tsyzhman/fantasy/actions/runs/37531199480) and [full production browser smoke 37531233499](https://github.com/Tsyzhman/fantasy/actions/runs/37531233499). Check verifies zero production audit findings, migration drift, all 16 isolated database and 1,236 unit tests, lint with zero errors/234 warnings, TypeScript and build. Authentication and all 28 applicable desktop/tablet/mobile checks pass, with 20 existing skips and zero failures or retries. The same final tree had passed both checks on `dce6219` before the authorized merge.

Before: scheduled runs 37297107382/37449445966 permitted ten source summaries while production returned eleven, failing all three viewports. Full rerun 37525321572 then exposed an unpublished-forecast expectation and a stale 36:11 season total compared with refreshed 40:59. After: the source bound uses the eleven-source contract; assertions use completed browser catalog snapshots, test explicit unavailable forecasts or exact published formulas, and verify XLSX completeness against the negotiated export count. Check 37528096210 also reproduced two high-severity production dependency advisories (GHSA-wq5f-xc86-pv6w and GHSA-68fv-2mgg-jv7q); compatible sharp 0.35.5/source-map-js 1.2.2 patches clear the gate without changing its threshold.

Native JPEG/WebP/AVIF encode/decode, SVG rendering and source-map round-trip pass, loading libvips 8.18.7/librsvg 2.63.2. Optional runtime lockfile entries are preserved for cross-platform CI. The local full check also passes 1,258 tests with two existing skips, TypeScript, lint and build; it includes separately retained uncommitted WI-050/WI-051 work, which is excluded from this task's commits. The complete development audit retains nine findings (seven high, two moderate), recorded in TD-009.

The user explicitly authorized integrating the whole checked set. PR #38 was retargeted to main, marked ready and merged at 2026-10-06T21:04:14Z; PR #37 was automatically marked merged because its head is included. The existing chart/calendar work was already deployed in 0.3.118; WI-052 adds the smoke and compatible dependency correction in 0.3.119 without a production deployment. The prematurely dispatched old-main smoke 37531158068 was cancelled and is not correction evidence.

Final runtime audit at 2026-10-06T21:12:35Z: raw cache 700 rows/10,157,909 bytes (9.69 MiB of 250 MiB), zero expired entries; all seven duplicate checks and active KHL job count are zero. Web uses 780.4 MiB, worker 2.151 GiB and PostgreSQL 1.202 GiB, all healthy with zero restarts/OOM and no worker child. Host available memory is 5,498 MiB. Locally there is one `.next` output (1,394,070,045 bytes) and no remaining task Node process. These snapshots establish observed bounds, not a memory-leak proof. Cleanup of the task's 16,631,726-byte ignored browser artifact download was rejected by automatic command policy; it remains bounded locally, with no bypass attempted.

Evidence: `specs/work/evidence/WI-052/verification.json`. Canon action remains `none`.
