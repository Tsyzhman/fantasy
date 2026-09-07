# Repository bootstrap

Use this procedure when the repository has no explicit workflow state, when Prist asks for repository setup, or when a newer workflow bundle is available.

## Invariants

- Treat the repository as user-owned. Preserve unknown and changed files.
- Do not change global Codex, Claude, Git or shell configuration.
- Keep credentials outside tracked files, skill content, logs, screenshots and evidence.
- Accept workflow files only from a versioned manifest with safe relative paths and matching SHA-256.
- Stop with an exact conflict when a user-modified target cannot be merged deterministically.
- Select one explicit operational mode. Service availability never changes it.

## Classify the repository

- `new`: no product files exist. In `standalone`, install the complete starter spec-space and fill only confirmed product facts. In `prist-managed`, install only the connection bundle; author the first spec-space later through the main workflow and service-owned examples.
- `adopt`: product files exist and no supported spec-driven workflow is installed. Add missing infrastructure without overwriting existing AI instructions or product files.
- `upgrade`: a prior supported bundle or receipt exists. Replace a generated file only when its hash matches a known predecessor; preserve a customized file and report a conflict.

Repository setup mode describes this installation pass. Workflow mode describes the operational source (`standalone` or `prist-managed`). Store them as separate fields.

## Apply the bundle

1. Read the public bootstrap manifest, select a connection archive for the current client/platform and validate its schema, bundle version, archive SHA-256 and every payload path/hash.
2. Read existing project entrypoints and spec-space. Classify `new`, `adopt` or `upgrade` before writing.
3. Run a dry plan that lists create, update, unchanged, preserve and conflict actions.
4. Create required directories and apply files according to their overwrite policies. Reject symlink traversal and paths outside the repository.
5. Materialize the same canonical skill under `.agents/skills/spec-driven-work/` and `.claude/skills/spec-driven-work/`. Generate `CLAUDE.md` from the shared entrypoint; do not maintain a second manual rule set.
6. Let the runtime-free connection component materialize direct project-local remote MCP settings in `.codex/config.toml` and `.mcp.json`. Keep both secret-bearing generated configs locally ignored with permissions `0600`; never create or print them manually.
7. In `standalone`, keep `specs/protocols/*` as generated compatibility entrypoints until behavioral parity is confirmed. A Prist connection bundle installs the same full skill and focused references without repository compatibility protocols or operational files.
8. Store the local receipt in `.prist/workflow.json`, including schema version, repository setup mode, the exact `setup_context.workflow`, installed bundle, source hashes, installed hashes, conflicts and completion time. Keep `.prist/` untracked.
9. Let the connection component validate filesystem/Git state and build the receipt. A connected repository fails validation when `.prist/workflow.json` is absent or differs from `setup_context.workflow`.
10. In a Prist connection, submit repository setup only after all required artifacts and hashes pass. A ready receipt includes `workflow_state_persisted` and `workflow_state_matches_setup_context` checks.
11. Build and send the initial deterministic snapshot with `scripts/sync-spec-space.mjs sync`. Keep `repository_ready` distinct from spec freshness: a partial or pending snapshot remains visible and blocks a current completion claim.

Project-local MCP configuration becomes active only after the person trusts the repository. If the client discovered tools before the adapter existed, finish repository setup through the semantic HTTP path, report readiness, then ask the person to open a new agent session. Never change global client configuration to avoid that explicit trust boundary.

## Conflict and rollback

Do not partially report readiness. A conflict yields `repository_blocked` with affected paths and the safe next action. Keep the previous immutable bundle and its hash set so a clean generated installation can be rolled back without touching user-owned changes.

An upgrade retry uses the same repository and connection identity. Re-fetch the current manifest, rebuild the complete plan and receipt, and retry after the conflict is resolved.
