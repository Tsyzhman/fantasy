# Fantasy Scout project history

This history covers 1 September to 16 November 2026. It connects changes in the
application and its operations to their implementation, contracts, and release
records. Exact release versions are listed in the [changelog](../../CHANGELOG.md).
Deployment revisions and measurements are recorded in the
[production release history](../operations/PRODUCTION_RELEASES.md).

## September

- **Squad data and lineup refresh.** Batched player loading and bounded
  refresh work made the published `CURRENT_XI` pool practical for large
  leagues. Forecast recalculation ran in an isolated process to release its
  memory between cycles. Full player-table XLSX
  export was verified above 1,000 rows. SorareInside gained a fixture-scoped
  refresh at minute :05, using only players matched to the active club roster.
  [Snapshot architecture](../reference/ARCHITECTURE.md#rotating-squad-player-pool-snapshots) ·
  [XLSX release commit](https://github.com/Tsyzhman/fantasy/commit/19e603c) ·
  [Starting XI integration](../integrations/SORAREINSIDE_STARTERS.md)
- **KHL and Fantasy Arena.** The September combined releases added the isolated
  KHL catalog, squad planner, and virtual-coin Arena workflows. KHL gained
  resumable Sports.ru player history, official protocol statistics, and a
  separately labelled beta expected-points forecast. The protocol importer
  replaces facts by match and carries field-level coverage. The xG model has
  independent source and evaluation gates.
  [KHL verification](../guides/KHL_IMPLEMENTATION_STATUS.md) ·
  [Arena guide](../guides/BETTING_ARENA.md) ·
  [KHL ingestion contract](../../specs/modules/khl/INFRA-001-khl-data-ingestion.md)
- **Franchises.** The first published H2H reports joined prepared participant
  histories to round analytics. Round coverage and comparisons of actual
  points with the published expectation became visible in the report.
  [September release record](../../specs/work/archive/2026/WI-029-franchises-production.md)
- **Sports.ru trends and the Telegram assistant.** The integration added
  provider buy/sell trends, profile linking with short-lived codes, and
  consent-based deadline reports. The normal Moscow-time cycle imports the
  latest available published squad at 08:00, starts shared data preparation
  at 08:10, and opens delivery at 09:00. Reports identify the source squad and
  distinguish missing or stale data. Open-round changes in a private Sports.ru
  squad are outside the published import.
  [Original rollout plan](../archive/README.md#superseded-guides-and-reports) ·
  [Linking contract](../../specs/modules/telegram/FEAT-007-deadline-assistant.md) ·
  [Delivery contract](../../specs/modules/telegram/INFRA-005-deadline-pipeline.md)
- **Repository and FPL.** Public documentation moved to English and into
  topic-based guides. Official FPL roster imports began checking active
  membership independently of player position. FPL prices, rules, and points
  remain scoped to their own contest.
  [Documentation migration](../../specs/work/archive/2026/WI-039-english-documentation.md) ·
  [FPL roster verification](../../specs/work/archive/2026/WI-044-fpl-active-roster-import.md)

## October

- **Football scopes and transfers.** League-specific club caps and round
  transfer allowances became explicit. Platform transfer trends began
  comparing the platform's observed squad changes with the latest published
  round, independently from Sports.ru's own published popularity figures.
  The league-wide pool audit reconciled reviewed identities and reported
  unmatched players and source exclusions.
  [Squad rules](../../specs/modules/machete/FEAT-001-global-ranking-strategy.md) ·
  [Platform trends](https://github.com/Tsyzhman/fantasy/pull/39) ·
  [Pool audit](https://github.com/Tsyzhman/fantasy/pull/47)
- **Franchise filters and refresh.** Date and league filters were bound to
  the actual report population. Franchise collection and calculation were
  serialized with the heaviest Squad jobs. Publication kept the last good
  snapshot available through source failures.
  [Report filters](https://github.com/Tsyzhman/fantasy/pull/40) ·
  [Refresh recovery](../../specs/work/archive/2026/WI-079-franchise-refresh-serialization.md)
- **Design and production continuity.** Pressbox / Midnight Scout introduced
  independent theme and table-density preferences. Continuous deployment
  gained a candidate web instance, exact-revision checks, a graceful Caddy
  switch, and retained assets for existing tabs and rollback. Audit follow-up
  bounded archive writes and retention, and repaired confirmed KHL identities.
  [Design contract](../../specs/common/PROP-002-editorial-sport-design.md) ·
  [Continuous rollout](https://github.com/Tsyzhman/fantasy/pull/46) ·
  [KHL retention and identity fixes](../../specs/work/archive/2026/WI-071-khl-ingestion-retention.md)
- **Scheduled browser checks.** The smoke suite was updated to follow the
  current Squad actions and wait for the active KHL publication after catalog
  conflicts. The workflow exercises authenticated desktop, tablet, and mobile
  paths against the deployed site.
  [Smoke corrections](https://github.com/Tsyzhman/fantasy/pull/51) ·
  [Production monitoring](../operations/PRODUCTION_MONITORING.md)

## November through the 16th

- **Identity, availability, and guardrails.** SorareInside matches from
  out-of-scope clubs are filtered before validation. With a missing nearest
  forecast, a complete last-played XI can be applied when all 11 players
  still belong to the active pool. Franchise reports assign one observation
  to an XI per football round, retain freezes per H2H duel, and preserve
  full personal histories. A later audit added keyboard coverage, tighter
  Telegram delivery guards, and bounded franchise calculation memory.
  [Club scope](https://github.com/Tsyzhman/fantasy/pull/52) ·
  [Last-played XI](https://github.com/Tsyzhman/fantasy/pull/57) ·
  [Audit release](https://github.com/Tsyzhman/fantasy/pull/53) ·
  [Franchise identity](https://github.com/Tsyzhman/fantasy/pull/54)
- **Football analytics and forecasts.** Squad gained `FO Opp.` and `Alt Opp.`
  comparisons and hundredths in its forecasts. Machete added Massey league
  strength with xG coverage and played-schedule difficulty. MiXerr added two
  passing networks from a single StatsBomb match with separate lineup
  cutoffs. Five researched Sports.ru Squad forecasts became FIT, MIX, GAS,
  REF, and TIK. The visible default changed to the chance of scoring at least
  five points, with expected points still available in the same columns.
  [Massey and MiXerr](https://github.com/Tsyzhman/fantasy/pull/56) ·
  [Forecast replay](../research/SQUAD_FORECASTS_2026-11-13.md) ·
  [5+ calibration](../research/SQUAD_FIVE_PLUS_2026-11-13.md) ·
  [5+ rollout](https://github.com/Tsyzhman/fantasy/pull/62)
- **Source archives and CI.** The Baltika UI and API retired, with historical
  Wyscout records retained for Machete. GitHub source archives were aligned
  with the full Git tree for Prist, while the deploy/price-sync packaging
  script retained its own compact export. The PostgreSQL integration checks
  exposed two rate-limit key races, which were fixed in
  the repository's 0.3.167 change.
  [Repository cleanup](../../specs/work/archive/2026/WI-099-repository-revamp.md) ·
  [Prist archive fix](https://github.com/Tsyzhman/fantasy/pull/58) ·
  [Spec diagnostics](https://github.com/Tsyzhman/fantasy/pull/59) ·
  [Rate-limit fix and CI](https://github.com/Tsyzhman/fantasy/pull/63)

## Find the original material

- [Specification map](../../specs/SPEC-MAP.md) for active contracts.
- [Archive index](../archive/README.md) for earlier plans and files that moved
  out of the current tree.
- [Production release history](../operations/PRODUCTION_RELEASES.md) for the
  verified runtime revisions. The live `release` field is available from
  [application health](https://fantasy.tsyzhman.ru/api/health).
