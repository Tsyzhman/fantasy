# Agent guide

Fantasy Scout is an existing Next.js application with provider-backed football
analytics, an Excel import workflow, shot maps, and isolated additional modules.
Start with the [project README](../../README.md),
[architecture](../reference/ARCHITECTURE.md), and
[technical ownership map](../../specs/common/structure.md).

## Before changing the repository

1. Read [AGENTS.md](../../AGENTS.md) and the project `spec-driven-work` skill in
   `.agents/skills/spec-driven-work/SKILL.md` or the matching Claude entry point.
2. Resolve the explicit workflow mode. This repository uses `standalone`:
   specifications, code, tests, and work tracking are stored in Git.
3. Check the [work board](../../specs/BOARD.md),
   [specification map](../../specs/SPEC-MAP.md), and governing contract anchors.
4. Inspect the existing implementation before proposing a change. Follow the
   installed Next.js documentation when working on framework behavior.

## Track the appropriate scope

A small one-step change may finish in the current session without a work item.
Work with a separate outcome, acceptance criteria, dependencies, or continuation
gets a `WI-NNN` file and one board row. Copy `specs/.me.template` to `specs/.me`
before claiming work; keep this identity file local.

Use `Canon action: none` when fixing code to match an existing clear contract.
Update the canonical specification when the intended behavior changes. Keep
`spec://` addresses stable and attach `@spec` markers to responsible code and
direct contract tests. Add a WAL checkpoint only for unfinished work or handoff.

## Validate and report

Run the checks relevant to the change. Application-wide checks use
`npm run check` and run sequentially because Next.js shares generated output.
Documentation changes need working links, valid contract anchors, accurate
examples, and clean Git ignore behavior.

Public documentation prose is English. Preserve executable examples and exact
UI/source literals when their original spelling matters. Update relative links
when moving documents. Record the result and actual verification in the work
item; do not claim checks that were not run.

The [archived bootstrap prompts](../archive/README.md#original-bootstrap-prompts)
describe the earlier MVP and provide historical context.
