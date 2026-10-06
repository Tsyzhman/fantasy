# WI-052: Restore the scheduled production smoke on main

- Kind: `fix`
- Canon action: `none`

## Outcome

The default branch runs the production browser smoke with the deployed KHL eleven-source contract and compares each view with its loaded catalog snapshot, including honest unavailable-forecast states during publication.

## Specs

- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#table`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#cards`
- Constraint: `spec://modules/khl/FEAT-002-khl-squad#layout`

## Scope

- In: reproduce the scheduled GitHub failure, align assertions with the actual browser catalog snapshot and canonical unavailable-forecast state, verify the correction in PR #38, align the default branch with the reviewed correction and its existing PR dependency, validate GitHub checks and runtime resource bounds.
- Out: new application behavior, changes to the transfer-trends or workflow-validator tasks, production deployment, data resets.

## Dependencies

- Related: `WI-049`
- Existing correction: PR #38, based on PR #37.

## Acceptance

- [x] The failed scheduled run and its exact obsolete assertion are identified.
- [x] The full rerun exposes and records the additional forecast-publication and stale-snapshot failures.
- [ ] Revised smoke verifies published formulas or explicit unavailable states and compares statistics with the displayed snapshot without fixed waiting periods.
- [ ] The full production browser smoke passes on the corrected remote revision.
- [ ] The correction reaches main with the necessary merge authorization.
- [ ] GitHub Check and the full production browser smoke pass on main.
- [ ] Cache bounds, duplicate rows/jobs and runtime memory are checked after verification.

## Result

In progress. Scheduled runs 37297107382 and 37449445966 use main `bf973a435b269a75912da6dbf9e024e639a6bbe6` and fail on all three viewport projects because the test permits ten source summaries while production returns eleven. Full run 37525321572 confirms the eleven-source fix, with 27 passed, one failed and 20 expected skips. The mobile statistics test first requires an unpublished forecast, then compares a stale 36:11 season total with the refreshed 40:59 value on retry. Assertions now follow each completed browser catalog response; missing forecast details require the explicit unavailable UI, while published details still undergo exact formula checks. XLSX completeness follows the negotiated export's row count. Only the existing browser test, release metadata and work tracking change in this pass; application behavior remains as deployed.
