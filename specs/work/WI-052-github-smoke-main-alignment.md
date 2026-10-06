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
- [ ] The correction reaches main with the necessary merge authorization.
- [ ] GitHub Check and the full production browser smoke pass on main.
- [ ] Cache bounds, duplicate rows/jobs and runtime memory are checked after verification.

## Result

In progress. Scheduled runs 37297107382 and 37449445966 use main `bf973a435b269a75912da6dbf9e024e639a6bbe6` and fail on all three viewport projects because the test permits ten source summaries while production returns eleven. Full run 37525321572 confirms the eleven-source fix, with 27 passed, one failed and 20 expected skips. The mobile statistics test first requires an unpublished forecast, then compares a stale 36:11 season total with the refreshed 40:59 value on retry. Assertions now follow each completed browser catalog response; missing forecast details require the explicit unavailable UI, while published details still undergo exact formula checks. XLSX completeness follows the negotiated export's row count. This pass changes the existing browser test, compatible dependency patches, release metadata and work tracking; application behavior remains as deployed.

Check 37528096210 then exposes two high-severity production dependency advisories: sharp/librsvg GHSA-wq5f-xc86-pv6w and source-map-js GHSA-68fv-2mgg-jv7q. The compatible patched releases are sharp 0.35.5 (Node >=20.9.0) and source-map-js 1.2.2. The same WI now includes this necessary dependency correction for the existing GitHub Check acceptance; application source and audit thresholds remain unchanged.

Corrected full smoke 37528181539 on `8fe4adac233715f4ecb1f7fe7d366b01d94ddfda` passes all 28 applicable checks with 20 existing skips and no failures or test retries. Production dependency audit now reports zero findings. Native JPEG/WebP/AVIF encode/decode, SVG rendering and source-map round-trip pass; sharp loads libvips 8.18.7/librsvg 2.63.2. Existing optional runtime lockfile entries are preserved for cross-platform CI. The optional full development audit reports nine findings outside the production gate, recorded in TD-009; broad Tailwind/Next changes are outside this repair.

The full local `npm run check` passes: 1,258 tests pass, two existing database-only cases skip, lint has zero errors and 234 warnings, TypeScript and the production build pass. This local run includes the separately retained uncommitted WI-050/WI-051 work; the remote Check will verify the committed CI correction independently.
