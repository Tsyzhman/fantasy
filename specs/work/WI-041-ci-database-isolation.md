# WI-041: Run CI database tests in their required isolated environments

- Kind: `fix`
- Canon action: `none`

## Outcome

The GitHub Check workflow runs every tracked database integration test against
its intended disposable test database and reaches the application checks.

## Specs

- Governing: `spec://common/structure#root`
- Constraint: `spec://modules/betting/FEAT-001-virtual-league#ledger`
- Constraint: `spec://modules/betting/FEAT-001-virtual-league#opportunities`
- Constraint: `spec://modules/khl/INFRA-002-khl-storage-and-api#boundary`
- Constraint: `spec://modules/khl/INFRA-002-khl-storage-and-api#acceptance`

## Scope

- In: CI PostgreSQL port mapping, discovery and routing of the existing DB tests,
  disposable common/betting/KHL databases, serial execution, opt-in KHL test
  configuration, CI unit-test resource isolation, release metadata, GitHub
  verification, and publication.
- Out: application behavior, weakening test safety guards, schema or migration
  changes, production databases, production feature flags, and deployment.

## Acceptance

- [x] Reproduce the CI failures and inspect the required database guards.
- [x] Every tracked .db-test.ts file is routed to the correct isolated database.
- [x] The existing localhost/port/name safety guards remain unchanged; KHL tests run only with their explicit test opt-in.
- [x] Workflow YAML and shell syntax are valid, and the spec-space snapshot has no diagnostics.
- [x] All 11 current database integration tests run without failures or skips in GitHub CI.
- [ ] CI unit-test files execute serially while preserving the optimizer's existing five-second assertion.
- [ ] The full Check workflow succeeds with the patched dependencies, and publication is confirmed on main.
- [ ] Task-created caches and helper processes are accounted for, the final result is recorded, and the board entry is archived.

## Dependencies

- Related: `WI-040`

## Result

Check run 36404329686 passes install, Prisma generation, the production security
audit, and migration drift validation. The DB stage fails because two betting
tests require 127.0.0.1:55439/fantasy_betting_test_* while the workflow supplies
localhost:5432/fantasy_scout_test. Six KHL tests are skipped because their explicit
isolated-database opt-in is absent. The application checks are consequently skipped.

The updated workflow discovers and routes 3 common, 2 betting, and 6 KHL test
files. Each group uses its own disposable database at 127.0.0.1:55439 with
the original guards intact. YAML parsing and Bash syntax checks pass. The
spec-space snapshot is current with no diagnostics. Check run 36405455608 passes
all 11 database tests without failures or skips. Its unit-test stage passes 1131
tests and fails the optimizer timing assertion at 5669 ms during the parallel
run. CI unit-test files now execute one at a time; the five-second assertion and
application implementation remain unchanged. Further GitHub execution is pending.

With CI=true locally, all 199 unit-test files run serially: 1131 tests pass,
none fail, and one POSIX-shell test is skipped on Windows. The optimizer timing
assertion passes without changing its limit. Runner lint, release metadata,
and diff validation pass. The spec snapshot remains current with no diagnostics.

Evidence: `specs/work/evidence/WI-041/ci-database-checks.json`.
