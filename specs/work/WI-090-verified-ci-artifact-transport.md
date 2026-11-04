# WI-090: Deliver verified CI artifacts without the slow runner SCP route

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome

The canonical Deploy Production workflow can deliver its exact validated source and image archives through a bounded HTTPS artifact download when runner-to-server SCP is impractically slow, preserving immutable identity, host verification and continuous promotion.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#contracts`
- Constraint: `spec://common/INFRA-006-continuous-deployment#runtime`
- Constraint: `spec://common/structure#release-transport`

## Scope

- In: transport of the current run's freshly validated/built artifact, provenance/digest/allowlist checks, private short-lived download URL, bounded parallel ranges, optional current-run operator prestaging, bounded temporary storage and atomic archive publication, canonical workflow integration and focused adversarial tests.
- Out: manual promoter invocation, server-side image builds, skipped Check/ancestry verification, persistent GitHub credentials on the server, live file replacement, unrelated runtime changes.

## Acceptance

- [ ] Only the current canonical run's exact artifact is accepted; source SHA/version/tree, archive checksums and image IDs remain verified before promotion.
- [ ] Download uses verified HTTPS, strict SSH control and a short-lived URL with no GitHub token persisted on the server or secrets printed in logs.
- [ ] Size/time limits, restricted ZIP entries/paths, full digest checks, temporary cleanup and atomic final files reject partial, malformed, mismatched and traversal/symlink archives.
- [ ] Focused tests and workflow checks pass; full exact-SHA CI succeeds before production promotion.
- [ ] Actual transfer completes within the job budget; continuous release, exact runtime and bounded cleanup are verified through WI-084.

## Dependencies

- Related: WI-084, WI-087

## Result

In progress. Deploy 41812628792 and 41814939270 reached archive transfer after successful validation/build; runner SSH throughput of approximately 20–28 and 90 KiB/s cannot transfer the approximately 883 MB artifact within the job budget. Both are stopped before promotion. A local-to-server 4 MiB diagnostic achieved 2.98 MiB/s without persistent server writes. Root owns shared canon/tracking; the existing Sol 6.1 Max runtime chat owns implementation and focused tests.

Implementation is ready for full CI: 23 adversarial transport tests and seven release workflow contract tests pass; actionlint v1.7.12 reports no errors; all 60 Bash run blocks across six workflows parse. Independent release review found no blockers. Before: two direct runner SCP uploads could not fit the release budget. After: current-run HTTPS with eight ranges or bounded operator prestaging, strict provenance and complete hashes, private extraction, external deadline and unchanged canonical promotion. Production acceptance remains pending. Local eight-range probe achieved 8 MiB in 2.736 seconds; server eight-range probe achieved 8 MiB in 24.626 seconds. These are diagnostic samples, not full-artifact proof.
