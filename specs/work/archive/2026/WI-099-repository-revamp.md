# WI-099: Reduce repository and release clutter

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Current source, operator entry points and documentation describe the supported workflows. Historical reports remain reproducible from their verified Git revision. Release packaging uses independent runtime and setup stages.

## Specs

- Governing: `spec://common/INFRA-006-continuous-deployment#runtime`
- Governing: `spec://common/INFRA-006-continuous-deployment#contracts`
- Affected: `spec://modules/machete/FEAT-001-global-ranking-strategy#root`
- Affected: `spec://common/structure#documentation`

## Scope

- In: trace runtime and test entry points across the repository, remove confirmed dead paths, compact historical evidence, fix documentation and isolate release build inputs.
- Out: live rollout, database mutations outside disposable test databases, provider rules, and removal of supported user or operator workflows.

## Acceptance

- [x] Route, worker, operator and test entry points resolve after the removal of retired code.
- [x] A frozen Git archive retains all release inputs and omits historical evidence. Setup can run Prisma and operator commands independently of the web build.
- [x] Current documents point to valid code, commands, contracts and historical artifacts.
- [x] Main checks, representative integration checks, and disk/cache/memory readback are recorded.

## Result

Completed locally on 2026-11-06 on top of WI-098. The checkout began at `337e718`.

- The source graph included App Router files, the two URL-loaded workers, scripts, CI, operator commands, and test roots. The unused forecast model, tooltip, and adapters were removed. The legacy tooltip endpoint and stored-field normalization still cover old clients. Five Sports.ru mapping tests moved into the default suite, and current match-window assertions moved to the active module's test file.
- The Git tree went from 49.12 MB to 33.98 MB. The source release archive went from 25.76 MB to 13.66 MB. The archive manifest retained all 30 checked release inputs and omitted historical documentation and work evidence. Prisma migration, seed, and operator status ran without a web build on a disposable database. Compose configuration, shell syntax, and release-contract checks passed. The local Docker engine was stopped. CI verifies the Linux setup image and its contents during release packaging.
- Checked 197 Markdown documents, 459 local links, 46 documented API examples, and 68 npm command references. Both betting input bundles restored from the published baseline commit and matched all 96 file hashes. Replays write to ignored scratch directories.
- `npm run check` passed with 1,369 passing tests, four skips, and zero lint errors. ESLint reported 237 warnings. The standalone app started on loopback and served `/login` with status 200. The compiled manifest contained 102 routes. The production dependency audit reported zero vulnerabilities.
- All 90 integration tests and schema drift passed on disposable PostgreSQL 16 with UTC, matching CI. A first run using the Windows cluster default of Europe/Moscow reproduced two Telegram deadline comparison failures. The UTC profile passed both cases. The browser suite passed 48 scenarios, with 32 viewport-specific skips.
- The original checkout went from 4.97 GB to 3.88 GB after removal of 1.10 GB in stale build output and a duplicate install. Dry-run, lock and Windows junction handling were verified against disposable cleanup fixtures. The temporary build, dependencies, database and test outputs used for verification were removed.
