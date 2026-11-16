# Agent guide

Fantasy Scout is an existing Next.js application with provider-backed football
analytics, fantasy price imports, shot maps, and isolated modules for hockey,
franchise analytics, and virtual betting.
Start with the [project README](../../README.md),
[architecture](../reference/ARCHITECTURE.md), and
[technical ownership map](../../specs/common/structure.md).

## Before changing the repository

1. Read [AGENTS.md](../../AGENTS.md) and the project `spec-driven-work` skill in
   `.agents/skills/spec-driven-work/SKILL.md` or the matching Claude entry point.
2. Resolve the checkout's workflow mode through the agent entry point. If the
   checkout has a Prist setup, read its local `.prist/workflow.json` and use
   the installed router. The entry point also describes the standalone setup.
3. Read the [specification map](../../specs/SPEC-MAP.md) and governing contract
   anchors, then check current work in the configured workflow.
4. Inspect the existing implementation before proposing a change. Follow the
   installed Next.js documentation when working on framework behavior.

## Track the appropriate scope

Specifications, code, and tests are versioned in Git. A small change can be
completed in one step. Work with separate acceptance criteria, dependencies, or
continuation uses a tracked WorkItem.

- **Prist-managed checkout.** Use the configured Prist project for WorkItems,
  verification, and completion. The installed skill describes one-step
  completion and tracked start and finish. Earlier Git work items are
  available as historical evidence.
- **Standalone checkout.** Use the [board](../../specs/BOARD.md) and one
  `WI-NNN` file for tracked work. Copy `specs/.me.template` to `specs/.me`
  before claiming work or editing BOARD or WAL. Use a WAL entry for a
  checkpoint, handoff, or resumption.

Use `Canon action: none` when fixing code to match an existing clear contract.
Update the canonical specification when the intended behavior changes. Keep
`spec://` addresses stable and attach `@spec` markers to responsible code and
direct contract tests.

## Validate and report

Run the checks relevant to the change. Application-wide checks use
`npm run check` and run sequentially because Next.js shares generated output.
Documentation changes need working links, valid contract anchors, accurate
examples, and clean Git ignore behavior.

Public documentation prose is English. Preserve executable examples and exact
UI/source literals when their original spelling matters. Update relative links
when moving documents. Record the outcome and completed checks in the
configured workflow.

Historical bootstrap prompts and superseded runbooks are available from the
[archive index](../archive/README.md#superseded-guides-and-reports).
