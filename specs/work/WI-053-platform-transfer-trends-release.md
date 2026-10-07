# WI-053: Release platform transfer trends and verified fixes

- Kind: `implement`
- Canon action: `none`

## Outcome

The running production web and worker use the exact checked release containing the requested platform transfer mini block, workflow-validator correction and GitHub/dependency fixes.

## Specs

- Governing: `spec://modules/machete/FEAT-008-platform-transfer-trends#contracts`
- Governing: `spec://modules/machete/FEAT-008-platform-transfer-trends#ui`
- Governing: `spec://common/PROP-001-workflow-validation#root`
- Governing: `spec://common/structure#release-transport`
- Constraint: canonical immutable deployment in `docs/operations/DEPLOYMENT.md`.

## Scope

- In: publish the already implemented WI-050/WI-051 work and WI-052 completion evidence, version the combined release, run remote checks, promote an immutable exact Git revision through the canonical pipeline, verify production version/UI/API and resource bounds.
- Out: new product behavior, database resets, new collectors, unrelated tooling migrations, VPN rotation.

## Dependencies

- Related: `WI-050`, `WI-051`, `WI-052`.

## Acceptance

- [x] Current production is verified as 0.3.118 while main is 0.3.119 and the requested feature remains local.
- [ ] All requested source/spec/test changes are included in a clean remote commit descending from current main; the version is bumped consistently.
- [ ] GitHub Check passes the committed feature, validator and database contract tests.
- [ ] Canonical production deployment passes canary and guarded web/worker promotion.
- [ ] Health, both image labels and current release manifest match the exact new revision/version.
- [ ] Authenticated production smoke and the platform transfer panel/API verify preserved flows and truthful aggregate states.
- [ ] Cache bounds, duplicate facts/jobs, memory and absence of extra canaries/collectors are checked after deployment.

## Result

In progress. The 2026-10-07 user follow-up identifies that the new server release was not performed. Preparation includes the previously authorized requested feature and fixes; no independent product change is introduced. Production baseline is 0.3.118 at `f2dd8fdfa6d270c799381cb1ed68e6b53fb97243`; main baseline is 0.3.119 at `4606fb1f1f3988ab6d2360cfc6ff5b74bf66d813`.
