# WI-082: Restore scheduled GitHub browser checks and release the aligned revision

- Kind: `fix`
- Canon action: `none`

## Outcome

The default branch and production release agree on the current navigation contract, and the complete scheduled browser suite passes without weakening its assertions.

## Specs

- Governing: `spec://common/PROP-002-editorial-sport-design#contracts`
- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#sync-status`
- Governing: `spec://modules/khl/FEAT-002-khl-squad#table`
- Constraint: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://common/INFRA-006-continuous-deployment#observability`
- Constraint: `spec://common/FEAT-009-session-authentication#sessions`

## Scope

- In: classify recurring GitHub failures, correct the navigation smoke against the existing tools disclosure, wait for a reported active KHL publication after an actual catalog conflict, verify the complete suite and CI, align main with the already deployed production lineage, deploy through the configured immutable promoter and SSH `deploy` host, and inspect bounded caches, duplicates and memory.
- Out: navigation redesign, weakening tests, changing credentials, unrelated local changes, data resets and global cache pruning.

## Acceptance

- [ ] Repeated failed runs and their exact causes are recorded.
- [ ] Responsive smoke opens secondary tools, verifies sign-out visibility, and checks Escape/focus and disclosure reset.
- [ ] A real KHL revision conflict waits for the reported hourly cycle within a bounded timeout; consistent snapshot, duplicate and data assertions remain mandatory.
- [ ] The complete production browser suite and Check pass on the corrected revision.
- [ ] Main includes the correction and production lineage, so scheduled runs use current tests.
- [ ] The canonical deployment preserves service availability and public/image/manifest revision agreement.
- [ ] Cache sizes, duplicate records/jobs, memory, restarts/OOM and retained releases are checked after deployment.

## Result

In progress. Baseline: scheduled runs 40296235652 and 40176751972 both pass authentication and 26 browser cases, then fail the same tablet/mobile sign-out assertion at e2e/squad-responsive.spec.ts:62. Main is 69e5634 while production is 0.3.145 / 32fcc3d. The existing header deliberately puts sign-out inside a closed Tools & settings disclosure, as required by PROP-002.
