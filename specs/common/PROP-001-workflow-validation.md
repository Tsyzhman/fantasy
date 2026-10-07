---
status: active
---

<a name="root"></a>

# PROP-001: Local workflow validation {#root}

## Plain language {#plain-language}

The local validator checks the repository's declared workflow mode. Standalone repositories work without a Prist connection; managed repositories must retain a valid connection receipt. Codex and Claude use identical copies of the validator.

## Goal {#goal}

Accept valid local workflow state and report real configuration/traceability failures without inferring a Prist requirement from the presence of a local receipt.

## Scope {#scope}

Owns the local `check-workflow.mjs` CLI and its contract tests. This records the existing mode-selection contract in `AGENTS.md` and the project skill; it does not migrate the repository, install bundles or change the application's behavior.

## Governing specifications {#governing-specs}

- [Product boundary](main.md#root), `spec://common/main#root` — local repository infrastructure.

## Mode and state {#mode}

- Read the explicit mode from `.prist/workflow.json`, or the repository entrypoint when the receipt has no mode. Both declarations must agree. Unsupported modes, contradictory declarations and malformed/non-object workflow JSON fail with structured diagnostics.
- Explicit `standalone` takes precedence over connection-file presence. A local receipt, when present, uses a supported schema, `stateSource: repository` and `status: ready`. An entrypoint declaration may supply the mode without a receipt. A Prist connection is not required or read in this branch.
- Standalone requires `AGENTS.md`, the local BOOT entrypoint, specification map, product document and technical map.
- `prist-managed` preserves the existing receipt checks: supported schema, `connection_ready`, matching bundle/state source from the setup context, and a nonempty file manifest. A missing receipt or malformed connection fails. Older managed receipts without an explicit mode retain their prior file/entrypoint inference.
- Validate mirror parity, Claude's shared entrypoint import, BOARD identity/link integrity and current specification traceability. An existing specification space is checked in either mode.

## Runtime contract {#runtime}

The CLI reads local files and writes its JSON report to stdout. Exit code is zero on success and one on validation failure. It does not contact Prist, modify workflow state, create a cache, start a background process or write a snapshot/outbox. Test subprocesses have bounded time/output and their owned temporary fixtures are removed.

## Ownership and acceptance {#acceptance}

Both mirrored validators and direct tests carry this specification's marker. Tests cover standalone and managed acceptance, invalid/conflicting declarations, malformed receipts/connections, managed context mismatches, required local files and mirror parity. Both actual repository CLIs must pass for a completed validator change.

## Contract checklist {#checklist}

- [x] Scope, owning files and neighboring sources are defined.
- [x] Mode precedence, legacy compatibility and state invariants are explicit.
- [x] Failure diagnostics, exit codes and required artifacts are specified.
- [x] Read-only operation, client parity and verification criteria are defined.

## Related sources {#relationships}

- [Shared repository entrypoint](../../AGENTS.md).
- [Project skill](../../.agents/skills/spec-driven-work/SKILL.md), especially session entry and repository bootstrap.
- `spec://common/main#root` — product boundary; this tool remains local repository infrastructure.

## Changelog {#changelog}

- 2026-10-06: Registered the existing workflow-mode validation contract and its implementation ownership while resolving TD-008.
