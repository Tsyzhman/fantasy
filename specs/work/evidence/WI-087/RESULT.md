# WI-087 implementation and verification

Implementation is ready for root integration in `codex/project-audit-20261104`. Shared BOARD/WAL/SPEC-MAP/structure/CHANGELOG/version files were not edited. No source was staged, committed, pushed or deployed by this worker.

## Before -> after

- All three official Node base stages and `.nvmrc`: Node 24.21.0 -> Node 24.22.2. The Docker Registry index digest is `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`. Registry response bytes, Linux/amd64 manifest and image config hashes were checked; config declares `NODE_VERSION=24.22.2`. CI also verifies both exported image IDs use the exact `.nvmrc` version and retains the runtime non-root check.
- Manual Deploy: only unit/lint/typecheck plus profile checks in its own runner -> resolve requested ref once, run full reusable Check for that exact immutable SHA, then package/check the same SHA only after validation succeeds. Old successful runs are never consulted. Frozen canonical base, current-main ancestry, production ancestry, immutable archive/images, alternate-port promoter, traffic switch and rollback remain in place.
- Source verifier: CI assumed the workflow dispatch SHA equals the requested package ref -> explicit full `--expected-commit` binds a separately requested ref to the already validated commit. The existing `GITHUB_SHA` behavior remains the default when no override is supplied; CI now rejects a missing expected identity.
- Profile regressions: partial `beautifulsoup4` install and repeated tests in packaging -> one mandatory shared Check installs `scripts/franchise-analytics/requirements.txt` (`beautifulsoup4==4.14.3`, `numpy==2.2.6`, `pandas==2.3.3`, `scipy==1.15.3`) with no pip cache and discovers all `test_*.py`, including WI-088 memory tests. KHL transport/VPN/release regressions also live in this gate. WI-086 keyboard/dialog regressions run with bundled Chromium and the isolated five-viewport fixture; channel/source overrides are cleared and focused-only selection is forbidden. The duplicate packaging blocks are removed.
- SSH: freshly scanned network keys appended to ambient known_hosts -> bounded operator-pinned environment input, a fresh deduplicated host file and an isolated strict config for every SSH/SCP call. Private runner material is removed in `always()` cleanup. No production host key or private secret was read or changed by this worker.

## Protected host input

Secret name: `DEPLOY_KNOWN_HOSTS`, environment scope: `production`.

Consumers:

- `Deploy Production` -> `package-and-deploy` (transport only when dry_run=false).
- `Configure Production FPL VPN` -> `configure`.
- `Sync Production Fantasy Prices` -> `sync`.

Format at default port 22: `HOST ssh-ed25519 BASE64_PUBLIC_HOST_KEY`, newline optional. At another port: `[HOST]:PORT ssh-ed25519 BASE64_PUBLIC_HOST_KEY`. Verified hashed known_hosts entries, IPv6 and several distinct keys for the same endpoint are supported; at most 16 records and 16 KiB. Wildcards, marker/CA records and other endpoints are rejected. Key bytes are public host identity, never a client/private key.

Root reported provisioning this production environment secret after comparing an existing trusted local Ed25519 entry with the server public key over an already verified strict SSH connection. This worker did not provision or inspect actual secret values.

## Executed checks

- `node --test scripts/release-validation.test.mjs`: 7/7 pass. Invalid/short/branch/different SHA, explicit override argument failures, reusable workflow wiring, all mandatory checks, common Node pins and every SSH/SCP caller are covered.
- `python -B scripts/prepare-deploy-ssh.test.py`: 6/6 pass, including actual changed-key rejection by a disposable loopback-only OpenSSH server with all login methods disabled, missing/invalid/wrong-host/wrong-port/wildcard trust, duplicates, hashed pins, IPv6, nondefault ports and secret-safe errors. Temporary server and key files are removed.
- Existing release regressions: continuous deployment 18/18; image identities 3/3; AmneziaWG configuration 5/5; server-action artifact stripping 4/4. Total executed tests: 43 pass, none skipped.
- Targeted ESLint for the three changed/new release JavaScript helpers/tests: exit 0.
- Isolated UI CLI/config discovery with `--forbid-only --list`: 60 cases discovered across five viewports; no browser, auth setup or database was started.
- Official `actionlint` v1.7.12, verified published binary SHA-256: all six workflow files pass. ShellCheck/Pyflakes integration was disabled; separately all 60 workflow run blocks pass Git Bash syntax validation after inert substitution of GitHub expressions.
- Scoped `git diff --check`: pass.

The CLI regression originally used the live shared HEAD twice; one concurrent rerun failed during integration. It now reads from a disposable detached Git fixture with read-only object alternates, without creating any commit. The final 7/7 run passes; the earlier failure log is retained as `release-validation-shared-head-failure.txt`.

## Integration still owned by root

Root reported integrating the shared contracts/structure additions recorded in `CANON-AMENDMENT.md`. Run the sequential full unit/lint/typecheck/build, real isolated-PostgreSQL CI validation and immutable image build after integrating all chats. Verify the CI image Node patch and actual public/internal production revision during the controlled rollout. No production rollout was attempted here. The broad production acceptance stays open until that integrated verification is recorded.

The three latest successful Check runs completed in 306/310/315 seconds. The job budget increases from 20 to 30 minutes to accommodate Chromium/scientific/SSH dependencies and the new isolated UI suite; installation and test steps are bounded at 8 and 10 minutes. See `ci-time-budget.json`. Browser execution itself remains with WI-086/root and integrated CI; this worker only validates the CLI/configuration and gate wiring.

## Resources

No npm install, full build, Docker pull/build/cache, browser process or production SSH session was started by this worker. The official image was inspected through bounded Registry HTTP responses. Downloaded actionlint was checksum-verified in a disposable directory and removed; only small text/JSON evidence remains. Python repository checks use `-B`, and the new CI pip install uses `--no-cache-dir`. Final process/cache measurements are recorded in `resources.json`; unrelated shared processes and caches were preserved.

## Primary references

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.2
- https://docs.docker.com/dhi/explore/security-concepts/digests/
- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
- https://man.openbsd.org/ssh-keyscan
- https://man.openbsd.org/ssh_config
- https://github.com/rhysd/actionlint

Reddit/Stack Overflow precedents were searched first as instructed; technical choices rely on the primary references above.
