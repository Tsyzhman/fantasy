# Documentation archive

These documents preserve earlier plans, audits, and imported references.
Check the document's date and the [current architecture](../reference/ARCHITECTURE.md)
before using an archived proposal as an implementation guide. Current feature
contracts are indexed in the [specification map](../../specs/SPEC-MAP.md).

## Planning and original specification inputs

- [Original Excel-first implementation plan](planning/IMPLEMENTATION_PLAN.md)
- [First-screen MVP specification](planning/FIRST_SCREEN_SPEC.md)
- [June 2026 audit tasks](planning/AUDIT_TASKS_2026-06-16.md)
- [Improvement backlog](planning/IMPROVEMENT_BACKLOG.md)
- [Optimization plan](planning/optimization-plan.md)
- [UX roadmap](planning/ux-roadmap.md)
- [Machete ingestion optimization tasks](planning/MACHETE_INGESTION_OPTIMIZATION_TASKS.md)
- [Original global-ranking strategy specification](planning/GLOBAL_STRATEGY_SPEC.md)
- [Global-strategy formula recommendations](planning/GLOBAL_STRATEGY_FORMULA_RECOMMENDATIONS.md)
- [KHL implementation plan](planning/KHL_IMPLEMENTATION_PLAN.md)

The global-strategy documents are retained as inputs to the corresponding
canonical feature specifications. Work progress belongs in the work board and
work-item archive.

## Superseded guides and reports

- [Original agent package brief](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/archive/planning/README_FOR_CODEX.md)
- [Initial Codex prompt](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/archive/prompts/CODEX_START_PROMPT.md)
- [Follow-up Codex prompt](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/archive/prompts/CODEX_FOLLOWUP_PROMPT.md)
- [Wyscout source workbook columns](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/reference/SOURCE_TABLE_COLUMNS.md)
- [July 2026 beta readiness audit](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/testing/BETA_READINESS_AUDIT.md)
- [September 2026 Telegram rollout plan](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/TELEGRAM_DEADLINE_PLAN.md)

## Superseded operations guides

- [Deployment before WI-072](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/operations/archive/DEPLOYMENT-before-WI-072.md)
- [Docker before WI-072](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/operations/archive/DOCKER_PRODUCTION-before-WI-072.md)
- [Monitoring before WI-072](https://github.com/Tsyzhman/fantasy/blob/bd493e0f61f64843f169821e2de9272ee018d561/docs/operations/archive/PRODUCTION_MONITORING-before-WI-072.md)

Use the [current deployment guide](../operations/DEPLOYMENT.md) to operate a release.

## Historical evidence

The [recorded evidence at commit `bd493e0`](https://github.com/Tsyzhman/fantasy/tree/bd493e0f61f64843f169821e2de9272ee018d561/specs/work/evidence)
holds the full reports, input bundles, row-level exports, and long logs from
before the repository cleanup. Each file is available at its original path in
that revision. Current verification summaries live beside the [archived work
items](../../specs/work/archive/2026).

To extract one file without changing the checkout, create `.tmp` and export its
path with `git archive --format=zip --output=.tmp/history.zip <commit> <path>`.
The two betting research reports include exact input extraction commands.

## Design references

- [Superseded design reference — current instruction link](design/NEW_DESIGN.md)

The original design reference retains its metadata and terminology. It is
preserved separately from the Fantasy product contracts.
