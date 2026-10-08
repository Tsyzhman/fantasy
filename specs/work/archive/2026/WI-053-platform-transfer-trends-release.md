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
- [x] All requested source/spec/test changes are included in a clean remote commit descending from current main; the version is bumped consistently.
- [x] GitHub Check passes the committed feature, validator and database contract tests.
- [x] Canonical production deployment passes canary and guarded web/worker promotion.
- [x] Health, both image labels and current release manifest match the exact new revision/version.
- [x] Authenticated production smoke and the platform transfer panel/API verify preserved flows and truthful aggregate states.
- [x] Cache bounds, duplicate facts/jobs, memory and absence of extra canaries/collectors are checked after deployment.

## Result

Completed 2026-10-07. Production changed from 0.3.118 (`f2dd8fdfa6d270c799381cb1ed68e6b53fb97243`) to 0.3.120 (`ccb3653261a1e16f2d09f1ff7ffeffeaaf499931`). The requested WI-050 feature and WI-051 validator fix are now committed and deployed together with WI-052 GitHub/dependency fixes. [PR #39](https://github.com/Tsyzhman/fantasy/pull/39) merged into main as `d9cbec7839bf45cb1c4bda078f7c3a86cb136dc9`; its tree is identical to the deployed candidate tree `0c3ea206046d2f1ffa421aae00b09749322c8ae4`.

Candidate [Check 37585497798](https://github.com/Tsyzhman/fantasy/actions/runs/37585497798) and main [Check 37587112450](https://github.com/Tsyzhman/fantasy/actions/runs/37587112450) passed: 1,260 unit/contract tests, 20 isolated database tests, production audit with zero findings, lint with zero errors (234 existing warnings), TypeScript and production build. The source/version guards passed on the clean pushed revision; no database migration or VPN reconfiguration was introduced.

Canonical [Deploy 37585870107](https://github.com/Tsyzhman/fantasy/actions/runs/37585870107) passed exact archive verification, canary and guarded web/worker promotion. Active directory is `/var/www/fantasy-scout-releases/20261007T071643Z-v0.3.120-ccb3653`. Public health, both image revision/version labels, their image IDs and the release manifest agree. The first dispatch selected main for the workflow while checking out the candidate and was rejected by the source guard before packaging or server changes; dispatching on the candidate branch corrected it without weakening the guard.

Post-deployment [production browser 37587009915](https://github.com/Tsyzhman/fantasy/actions/runs/37587009915) passed authentication and 28 UI checks across desktop/tablet/mobile, with 20 existing production-inapplicable skips, zero failures and zero retries. A separate authenticated live aggregate/API and rendered-panel check passed for selected Sports, FPL and KHL scopes: correct access control, private/no-store responses, bounded results and no participant identifiers. The unprivileged fixture was removed completely. The actual Sports sample contained one comparable unchanged plan; FPL lacked comparable plans and KHL lacked a verified published baseline. These states are shown honestly and do not demonstrate populated rankings in every league.

Cache, duplicate facts/jobs and memory were checked before, during and after release verification. At 07:34:40 UTC all containers were healthy with zero restarts/OOM; raw cache held 700 rows / 10,086,605 bytes (zero expired), all seven duplicate checks and active KHL jobs were zero. Web used 709.7 MiB, worker 1.076 GiB and PostgreSQL 1.121 GiB; available host memory was 6,292 MiB. Two release directories remain (active 0.3.120 and rollback 0.3.118), with zero running canaries, no extra worker child or release helper, and the bounded franchise collector inactive after success. Docker build-cache output separates 1.061 GB private from 13.3 GB image-shared layers; total cache is 14.36 GB, not 1 GB. These snapshots verify current bounds, not the absence of long-term leaks.

Evidence: `specs/work/evidence/WI-053/verification.json`. Both final workflow CLIs passed with 53 work items, 18 typed specs, identical 13-file mirrors and zero errors. Canon unchanged. Existing development-only dependency advisories remain tracked by TD-009. Earlier local diagnostic cleanup rejections were already reported and were not retried. Final result/BOARD/evidence bookkeeping is recorded locally after the immutable deployed commit; it does not alter the deployed tree.
