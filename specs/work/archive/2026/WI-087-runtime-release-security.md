# WI-087: Patch Node runtime and enforce release validation

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Production runtime receives current Node 24 security patches and deployment validates the exact source before promotion.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Governing: `spec://common/INFRA-006-continuous-deployment#contracts`
- Constraint: `spec://common/INFRA-006-continuous-deployment#root`

## Scope

- In: Node image/runtime pins, required exact-revision checks; operator-verified pinned SSH channel for production workflows.
- Out: unrelated work, interface capability removal, unreviewed production mutations.

## Acceptance

- [x] Verified official image digest; supported patch at CI/runtime; audit, unit/DB/migration checks gate exact deployment; continuity and rollback contracts preserved.
- [x] Applicable tests pass and before/after evidence is recorded.

## Dependencies

- Related: WI-084

## Result

Completed: official runtime pin, full exact-source CI and controlled production release verified on 2026-11-04.

Before -> after: Node 24.21.0 -> official digest-pinned 24.22.2 across all three base stages and CI; partial manual-deploy checks -> mandatory reusable full Check of one frozen SHA, with that same SHA verified before packaging and isolated UI regression coverage; repeated partial Python profile install -> pinned scientific requirements and all profile regressions in the single required gate; network-scanned SSH trust -> strict operator-pinned `DEPLOY_KNOWN_HOSTS` for all three production SSH workflows.

Executed: 43 tests passed (7 revision/workflow, 6 actual SSH/negative input, 18 rollout, 3 image identity, 5 VPN, 4 server-action artifact tests); targeted ESLint passed; actionlint accepted all six workflows; all 60 workflow run blocks passed Bash syntax validation; scoped diff whitespace check passed. UI CLI discovery found 60 isolated scenarios; Check clears channel/source overrides and adds the browser gate with a 30-minute job budget (8-minute install/10-minute test limits). No general build/typecheck/install or deployment was run by this worker.

Evidence: [RESULT.md](../../evidence/WI-087/RESULT.md), [official-node-image.json](../../evidence/WI-087/official-node-image.json), individual test logs and [resources.json](../../evidence/WI-087/resources.json). Root reported provisioned production `DEPLOY_KNOWN_HOSTS`; format/scopes are documented in RESULT. No secrets were changed or recorded here.

Canon integration: [CANON-AMENDMENT.md](../../evidence/WI-087/CANON-AMENDMENT.md) records exact INFRA-006 and structure additions for root, who reported their integration alongside WI-088; the worker did not edit those shared files. Shared maps/tracking/version files remain untouched; no staging/commit/push/deploy. Root owns the integrated acceptance and final tracking closure.



Root production acceptance, 2026-11-04: canonical Deploy [41819445507](https://github.com/Tsyzhman/fantasy/actions/runs/41819445507) successfully released 0.3.149 / `269980b7bbc8d16c850aad89229423f5a2383346` after fresh complete CI. Public health, release markers and web/worker OCI labels agree; Node 24.22.2 verified. Across promotion, 611 public probes had zero errors and 20 consecutive new-revision probes retained old assets. [Release identity](../../evidence/WI-084/release-identity-0149.json), [availability](../../evidence/WI-084/release-availability-summary.json), [CI result](../../evidence/WI-090/ci-validation-summary.json).
