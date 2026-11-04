# WI-090 implementation ready for root integration

## Before -> after

- Large archives: two direct runner SCP transfers -> mandatory current-run artifact upload, authenticated current-run/current-attempt provenance and verified HTTPS range delivery, with an explicit bounded `operator-prestage` option for the measured slow server/CDN route.
- Artifact retention: optional upload with no gate output -> required `id: artifact`; exact artifact ID/digest are passed to the transport. Artifact name includes release, run ID and attempt. Only packaging receives `actions:read`; the GitHub token stays off the server and redirect storage requests carry no Authorization header.
- Manifest: source commit/image IDs only -> source commit/tree/version, source/image archive hashes, exact image IDs and repository/run/attempt identities all bound to the same upload.
- Remote files: unverified partial final SCP targets -> bounded private ZIP download/inbox, four exact flat regular-file entries, full ZIP and per-file hashes/sidecar/manifest checks, then atomic no-clobber publication of the same two canonical paths. Unchanged promoter performs the existing exact archive/image loading verification, main/current-production ancestry, migration compatibility, locks and continuous rollback.

Files: `.github/workflows/deploy-production.yml`, `.github/workflows/check.yml`, `scripts/transfer-ci-artifact.py`, `scripts/transfer-ci-artifact.test.py`. Root owns specifications, maps, WI/BOARD/WAL, deployment docs, release version, commit/push and production execution; none were edited by this worker.

## Verified locally

- Transport tests: 23/23 pass, including malformed ZIP, partial/wrong/oversize ranges, ignored ranges, missing Content-Length, wrong whole/file hashes, traversal/absolute/duplicate entries, symlink/directory modes, compression bomb, manifest/source/tree/version/run/image substitution, stale/foreign provenance, URL/token redaction, fresh URL retry, exact current prestage, ignored partial/foreign files, time/disk budgets, cleanup and atomic publication rollback.
- Existing exact-revision/workflow contracts: 7/7 pass.
- actionlint v1.7.12, official checksum-verified binary: all six workflows accepted. ShellCheck/Pyflakes integration disabled; separately all 60 run blocks pass Git Bash syntax validation after inert GitHub expression substitution.
- Scoped `git diff --check`: pass.

The default is HTTPS with eight workers; 32-worker scaling was not proven and is not used. Current root measurements support operator-prestage for this release. Both modes enforce the same current artifact digest and full identities. Exact operator fields/commands are in `OPERATOR.md`.

No npm install, full build/typecheck, actual artifact transfer, real server execution, commit/push or production mutation was performed by this worker. Full fresh CI and actual transfer/promotion acceptance remain with root. No deployment success or full-artifact speedup is claimed here.

## Resource handling

The tests use small disposable fixtures and `-B`; all thread pools/responses are closed and scoped temporary files are removed. The downloaded lint binary is removed after validation. Only small text/JSON evidence is retained; final measurements are in `resources.json`. There is no cross-run artifact cache or background polling process.

## Sources and precedents

Reddit/Stack Overflow precedents were checked first; implementation uses primary GitHub documentation:

- https://docs.github.com/en/rest/actions/artifacts#download-an-artifact
- https://github.com/actions/upload-artifact#outputs

The download redirect is obtained without following it with the API token. The signed HTTPS URL is passed only inside pinned SSH stdin; no URL or token is logged, put in arguments or persisted. Prestage does not mint or forward any signed URL from CI to the server.
