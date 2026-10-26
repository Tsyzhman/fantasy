# Documentation

Fantasy Scout documentation is organized by topic. Start with the
[project README](../README.md), [product brief](product/PRODUCT_BRIEF.md), and
[architecture](reference/ARCHITECTURE.md) for an overview of the application.

The application UI currently uses Russian labels. Literal UI text, provider
names, command arguments, source fixtures, and raw verification evidence may
retain their original language so they can be compared with the application.

## Product and feature guides

- [Product brief](product/PRODUCT_BRIEF.md)
- [Admin workflows](product/ADMIN_UX.md)
- [Fantasy Arena](guides/BETTING_ARENA.md)
- [KHL implementation status and readiness gates](guides/KHL_IMPLEMENTATION_STATUS.md)

## Development

- [Local development](development/LOCAL_DEVELOPMENT.md)
- [Agent guide](development/AGENT_GUIDE.md)

## Architecture and reference

- [Architecture and data flows](reference/ARCHITECTURE.md)
- [Data model](reference/DATA_MODEL.md)
- [API routes](reference/API_ROUTES.md)
- [Fantasy scoring](reference/FANTASY_SCORING.md)
- [Source workbook columns](reference/SOURCE_TABLE_COLUMNS.md)

## Provider integrations

- [FotMob import](integrations/MACHETE_FOTMOB_IMPORT.md)
- [FotMob collection and parsing details](integrations/FOTMOB_COLLECTION_AND_PARSING.md)
- [Sports.ru fantasy prices](integrations/SPORTS_RU_FANTASY_SYNC.md)
- [Wyscout-style Excel import](integrations/WYSCOUT_EXCEL_IMPORT.md)
- [Probable lineup synchronization](integrations/PROBABLE_LINEUP_SYNC.md)
- [SorareInside starters](integrations/SORAREINSIDE_STARTERS.md)
- [Sports.ru squad-transfer extension](../extensions/sports-squad-transfer/README.md)

## Operations

- [Deployment](operations/DEPLOYMENT.md)
- [Docker production](operations/DOCKER_PRODUCTION.md)
- [Production monitoring](operations/PRODUCTION_MONITORING.md)
- [Production release procedure](operations/PRODUCTION_RELEASES.md)
- [Beta launch runbook](operations/BETA_LAUNCH_RUNBOOK.md)

## Testing and validation

- [Acceptance criteria](testing/ACCEPTANCE_CRITERIA.md)
- [Data quality](testing/DATA_QUALITY.md)
- [Model backtesting](testing/MODEL_BACKTEST.md)
- [Beta load testing](testing/BETA_LOAD_TEST.md)
- [Beta readiness audit](testing/BETA_READINESS_AUDIT.md)
- [Beta user-test protocol](testing/BETA_USER_TEST_PROTOCOL.md)
- [Browser beta checks](testing/BROWSER_BETA_CHECK.md)

Audit and test reports state the revision, date, or dataset they checked. Their
recorded results are evidence for those runs, rather than a claim that every
later revision has passed the same checks.

## Research

- [Betting feasibility, 7 September 2026](research/BETTING_FEASIBILITY_2026-09-07.md)
- [Extended betting feature research, 7 September 2026](research/BETTING_FEATURE_RESEARCH_2026-09-07.md)
- [KHL feasibility, 6 September 2026](research/KHL_FANTASY_FEASIBILITY_2026-09-06.md)
- [KHL source evidence, 7 September 2026](research/KHL_SOURCE_EVIDENCE_2026-09-07.md)

## Design and historical planning

- [Current design system: Midnight Scout / Pressbox](design/DESIGN.md)
- [Squad-card design concepts](design/drafts/squad-player-card-concepts.html)
- [Archive index](archive/README.md) — previous plans, original specification inputs, and imported design references.

## Canonical specifications and work tracking

- [Specification map](../specs/SPEC-MAP.md)
- [Product purpose and boundaries](../specs/common/main.md)
- [Technical ownership and repository structure](../specs/common/structure.md)
- [Work board](../specs/BOARD.md)
- [Work-item format](../specs/protocols/WORK-ITEM-PROTOCOL.md)
- [Archived work items](../specs/work/archive/2026)
- [Verification evidence](../specs/work/evidence)
- [Changelog](../CHANGELOG.md)

The active feature and infrastructure specifications in `specs/` govern product
behavior. Their paths and contract anchors stay stable when other documents
move. The archive contains historical context and source material.
