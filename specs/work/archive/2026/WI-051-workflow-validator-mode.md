# WI-051: Validate explicit standalone and Prist workflow modes

- Kind: `fix`
- Canon action: `new-spec`

## Outcome

The workflow validator accepts the repository's declared standalone mode and preserves validation of managed connection receipts.

## Specs

- Governing: `spec://common/PROP-001-workflow-validation#root`
- Affected: `spec://common/PROP-001-workflow-validation#root`
- Constraint: the explicit workflow-mode contract in `AGENTS.md` and the project `spec-driven-work` entry procedure.

## Scope

- In: registration of the existing mode contract and its ownership, mode resolution, mode-specific validation, mirrored Codex/Claude scripts, regression fixtures, TD-008 resolution and resource checks.
- Out: workflow migration, bootstrap bundle upgrades, global skills/configuration, application behavior and deployment.

## Acceptance

- [x] Reproduce the standalone regression before changing the validator.
- [x] Explicit mode takes precedence over file-presence inference; entrypoint fallback and existing managed receipts remain supported.
- [x] Standalone prerequisites and receipt fields are checked without requiring a Prist connection; invalid/conflicting modes and broken receipts fail clearly.
- [x] Managed connection-context mismatch, missing receipt and malformed JSON continue to fail.
- [x] Both mirrored scripts are identical and both actual repository checks pass.
- [x] Focused tests, lint/types, snapshot and resource/fixture cleanup checks pass; TD-008 moves to Resolved.

## Result

Completed locally on 2026-10-06. TD-008 is resolved; no deployment, workflow migration, global skill/configuration change or application runtime change was made.

Before: any `.prist/workflow.json` selected managed mode, so the valid standalone receipt failed `state:connection-kit`. After: explicit receipt/entrypoint declarations select the mode-specific checks, standalone validates local prerequisites and its own ready/repository state, and managed context/receipt checks remain intact. Invalid or contradictory declarations and malformed JSON report structured failures. Older managed receipts remain supported. Both modes validate an existing specification space.

Registered the existing workflow contract as PROP-001 so the CLI and direct tests have a valid ownership marker; `structure.md` remains the technical map. Both Codex and Claude scripts are byte-identical. Both actual repository CLIs return `passed`, exit zero, and no errors.

The initial regression suite reproduced 11 failures out of 17 tests before the fix. The final 19 contract tests pass, including two additional malformed-connection/contradictory-entrypoint cases. `npm test` passed 1,258 tests with two existing skips and no failures. Focused ESLint and `npm run typecheck` passed. A production rebuild was unnecessary for this tooling-only change. `git diff --check` passes. Specification snapshot is `current`, diagnostics empty, fingerprint `1bf985c24128bc570a31d50596cae2e51424fde730ad8bcfa1d465c6c1fae911`.

Resource checks: observed process peaks were 331,444,224 bytes for Codex and 330,178,560 for Claude; both owned CLI processes exited. No validator processes or temporary fixture directories remain. Tests limit each child to 15 seconds and 2 MiB of output, and verify the owned fixture path before recursive cleanup. No persistent cache, collector or background process was added; unrelated processes and caches were preserved. These are per-command measurements, not a long-term memory-leak claim.

Evidence: [verification](../../evidence/WI-051/verification.json); detailed logs are named there under `.tmp/WI-051-*`.
