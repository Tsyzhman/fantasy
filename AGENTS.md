# AI entry point

Before any action, use the project `spec-driven-work` skill as the primary router.
Codex finds it in `.agents/skills/spec-driven-work/`; Claude Code uses
`.claude/skills/spec-driven-work/`. If the client cannot discover the skill, read
`specs/protocols/BOOT.md` in full.

This repository uses `standalone` mode. Specifications, code, and tests are the
canonical sources in Git. Work tracking lives in `specs/BOARD.md`, `specs/work/`,
and, when needed, `specs/WAL.md`. A Prist service is not required.

## Core invariants

- An explicit `WI-NNN` resolves to its file, one board row, any relevant WAL
  checkpoint, and its governing specifications.
- Resolve ordinary-language requests through the board, specification map,
  technical ownership map, specifications, and `@spec` markers.
- A one-step change completed in the current session may omit WI, BOARD, and WAL.
- Tracked work gets a `specs/work/WI-NNN-*.md` file and one board row.
- Change WAL only for a checkpoint, handoff, or resuming unfinished work.
- A specification stores the canonical contract; a WI stores the outcome, scope,
  acceptance criteria, and result of the current pass.
- Register new specifications in `SPEC-MAP.md`. Update `common/structure.md` when
  modules, namespaces, directory ownership, or code ownership change.
- A fix to match a clear active contract uses `Canon action: none`. Update the
  specification only for an actual contract change or a missing contract detail.
- Require `specs/.me` before claiming a WI or changing BOARD/WAL. Read-only
  analysis and one-step work may proceed without it. Never commit this identity.

## Interface preservation

Preserve existing UI/UX workflows during technical changes. Tell the user
explicitly if the selected backend or API cannot support the existing interface.
Removing or simplifying user capabilities requires a direct user request.

## Production availability

Never stop or replace the serving production web version to build, back up,
rehearse migrations or start a release. First start a second version on the
alternate loopback port, verify its exact revision and health, then gracefully
switch traffic through Caddy. Keep the old version available for rollback and
request draining. Migrations must be reviewed for compatibility with both
versions; refuse an unsafe deployment while production remains running.
Follow `spec://common/INFRA-006-continuous-deployment#root` and the canonical
`scripts/deploy-production-docker.sh` promoter. Do not use `docker compose down`,
stop-and-recreate, direct live-file replacement or a Caddy restart for rollout.

## Traceability

New or substantially changed specification-owned code receives an up-to-date
`@spec spec://...#...` marker at responsibility boundaries: files, handlers,
services, major UI components, workers, migrations, and materializers.
Direct contract tests also receive the owning `@spec` marker.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
