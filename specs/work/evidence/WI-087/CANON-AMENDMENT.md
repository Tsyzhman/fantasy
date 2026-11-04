# WI-087: canonical additions for root integration

The worker deliberately did not edit the shared specifications or maps. Root subsequently reported integrating the contracts/structure changes, including the UI gate, alongside WI-088's independently owned heavy-jobs amendment. The following text records the proposed details for that integration review. They add missing release validation and host identity details to the existing active contract; no new specification or namespace is needed.

## INFRA-006 #contracts

Insert after the current deployment entry-point paragraph:

> `Deploy Production` resolves the requested ref and canonical main version base to full immutable commit SHAs once. Before source packaging or image construction, its required reusable `Check` workflow checks out that same release SHA and rejects a different HEAD. Required validation includes the production dependency audit, isolated common/auth/betting/KHL database integration tests, migration drift, runtime database permission probes, unit tests, lint, typecheck, application build, isolated keyboard/dialog browser regression tests and release/transport regression tests. Franchise regression tests install the existing pinned scientific requirements. Packaging depends on successful completion of this invocation and checks out/verifies the same frozen SHA. A previous successful workflow run, a different repository/ref/SHA, a skipped validator or a failed/cancelled validator cannot authorize packaging. The canonical main ancestry check is repeated before packaging; production ancestry remains mandatory before promotion.

> Every production SSH workflow obtains `DEPLOY_KNOWN_HOSTS` from the protected `production` environment. This contains the operator-verified public host keys for exactly the configured host and port, obtained through an existing trusted channel and compared with the server public host key. Never establish trust through fresh network key scanning. Missing, oversized, malformed, wildcard or wrong-endpoint input aborts before transport. All SSH/SCP operations use a dedicated configuration with strict host checking, batch authentication, no DNS trust fallback, no global host trust and no automatic key learning. A changed server key fails closed. The runner writes a fresh bounded host file instead of appending; it removes only its dedicated SSH files on job exit. Host key rotation requires verification through the existing trusted channel before updating the protected environment value.

## INFRA-006 #runtime

Append to the first runtime bullet:

> CI's exact Node patch in `.nvmrc` matches all official digest-pinned Node base stages. Before publishing the image archive, CI executes both runtime and setup image IDs without networking and verifies their exact Node version against `.nvmrc`; the runtime also verifies its non-root user.

Keep the detailed current Node patch/digest in Dockerfile/.nvmrc and verification evidence rather than duplicating a version number in the durable spec.

## INFRA-006 #acceptance

Append:

> Regression checks reject short/invalid/different release SHAs and verify the required dependency from packaging to full validation. An isolated loopback-only SSH server proves a pinned host reaches the deliberate authentication refusal and a substituted host key fails before authentication without rewriting the trusted host file. Missing/malformed/wrong-host/wrong-port inputs also fail closed.

The isolated browser gate uses bundled Chromium, clears local channel/source overrides and rejects focused-only test selection. It exercises the real components against a loopback fixture without production authentication or database access.

## common/structure #release-transport

Insert before continuous rollout ownership:

> `.github/workflows/deploy-production.yml` freezes release identity and requires the reusable `.github/workflows/check.yml` validation before packaging. `scripts/verify-release-revision.mjs` and `scripts/verify-release-source.mjs` enforce the exact checkout identity; `scripts/release-validation.test.mjs` verifies the gating contract. `scripts/prepare-deploy-ssh.py` owns bounded operator-pinned SSH material for deployment, VPN configuration and price synchronization; `scripts/prepare-deploy-ssh.test.py` exercises actual OpenSSH host-key rejection. Ownership: `spec://common/INFRA-006-continuous-deployment#contracts` and `#runtime`.

No directory or module ownership is transferred. Add a 2026-11-04 WI-087 change-history entry for the required same-SHA validation, pinned host trust and runtime consistency checks to the two affected canonical files when integrating.
