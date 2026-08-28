# Changelog

All production versions are built from Git commits and tagged after successful
promotion. Runtime identity is available from `/api/health` and from the OCI
image labels `org.opencontainers.image.version` and
`org.opencontainers.image.revision`.

## 0.3.48 - 2026-08-28

### Added

- Reworked the fantasy squad planner into a first-class mobile and tablet
  experience with persistent navigation, touch-sized roster controls, inline
  player actions, and one-step replacements without bouncing between dialogs.

### Fixed

- Bounded local upload discovery and scrubbed local databases, environment
  files, QA output, and development caches from the standalone production
  artifact after every build.

## 0.3.47 - 2026-08-28

### Added

- Added Ligue 1 probable-lineup synchronization from Fantasy Coach. The parser
  selects the latest advertised gameweek, requires all 18 clubs with 11 unique
  players each, and is available through the daily 14:30 UTC scheduler, CLI,
  and the existing admin ingestion page.

## 0.3.46 - 2026-08-28

### Fixed

- Keep a confirmed `official-transfer` club assignment ahead of a stale
  Sports.ru price-team mapping in both the fantasy player pool and transactional
  squad validation. Sports.ru remains authoritative over ordinary FotMob roster
  lag, while completed-match FotMob starting-XI promotion is unchanged.

## 0.3.45 - 2026-08-28

### Fixed

- Accept the official FPL live endpoint's boolean `in_dreamteam` and `played`
  flags while retaining strict numeric validation for scoring data. FPL price
  synchronization can now complete its finalized-gameweek score refresh.

## 0.3.44 - 2026-08-28

### Fixed

- Deactivate stale player memberships and starter flags when FotMob removes a
  club from a league season. This keeps source-agnostic roster consumers such
  as price mapping and forecasts from seeing players at both their current and
  relegated clubs.

## 0.3.43 - 2026-08-28

### Fixed

- Added a durable `official-transfer` roster override for the short window in
  which a club has confirmed a transfer but FotMob still exposes the player in
  the old squad. FotMob refreshes can update the confirmed target membership,
  but cannot reactivate a conflicting stale-club membership.

## 0.3.42 - 2026-08-28

### Fixed

- Split production scheduler ownership between the web and worker containers.
  Heavy background schedulers and their dependency graphs now load only in the
  worker, while FPL and probable-lineup schedules remain in web alongside their
  admin-trigger concurrency guards. This prevents duplicate startup work,
  forecast recalculations, FPL transaction timeouts, and avoidable web memory
  use.

## 0.3.41 - 2026-08-28

### Fixed

- Fixed Serie A probable-lineup matching for joined surnames such as
  `Delprato` / `Del Prato` and for roster nicknames such as
  `Valdepenas` / `Valde` when the source and active roster also agree on the
  shirt number. A shirt number alone is still insufficient to match a player.
- Probable-lineup scheduler warnings now identify each skipped team, unresolved
  source player, reason, and bounded candidate list instead of exposing only an
  aggregate skipped-team count.

## 0.3.40 - 2026-08-27

### Added

- Added independent admin buttons for manually refreshing EPL, Serie A, and
  Bundesliga probable starting lineups from the existing ingestion page. The
  admin-only route accepts only server-defined source keys and shares the
  scheduler's concurrency guard and per-team advisory locks.

## 0.3.39 - 2026-08-27

### Added

- Added the production probable-lineup scheduler: it performs an idempotent
  startup catch-up and then synchronizes EPL, Serie A, and Bundesliga every day
  at 14:30 UTC. Deployment canaries explicitly disable the scheduler so they
  cannot mutate production starting-XI flags.

## 0.3.38 - 2026-08-27

### Added

- Added a guarded probable-lineup sync for Premier League (Fantasy Football
  Scout), Serie A (Gazzetta), and Bundesliga (LigaInsider), with dry-run/apply
  modes, dynamic discovery of LigaInsider club URLs, exact FPL provider-code
  matching, roster-scoped fallback matching, compact provenance, and strict
  league/team completeness checks.

### Changed

- Unified actual-match, manual, and probable-lineup writes on the same
  per-team PostgreSQL advisory lock.
- Updated the pinned `nanoid` and transitive `js-yaml` patch releases to remove
  the high-severity advisories found during the dependency audit.

## 0.3.37 - 2026-08-26

### Changed

- Pinned the sticky global header navigation to the right, so the chrome sits
  with the content's trailing edge instead of stretching from the left on wide
  screens.
- Halved the Bookmaker favorites panel and pinned it to the right of transfer
  suggestions on wide screens.

## 0.3.36 - 2026-08-26

### Changed

- Transfer recommendations and auto-pick now score a squad as the maximum-FO
  starting XI (1 goalkeeper + 10 outfield players), so leftover budget is not
  spent on luxury bench pieces that never enter that XI.
- Tightened Cloudline type and control sizes so dense planner screens fit more
  content, and widened page shells for ultrawide monitors—especially the squad
  pitch and player-pool table.

## 0.3.35 - 2026-08-26

### Changed

- Adopted the Isty Cloudline design system across the product: Cloud Day and
  Cloud Night semantic tokens, page atmosphere, rounded surfaces, gradient
  primary actions, Onest plus JetBrains Mono, and a persisted theme toggle.

## 0.3.34 - 2026-08-26

### Fixed

- Leagues whose provider statistics contain no player xG/goals or recoveries
  at all now receive forecasts via a uniform split of the team totals across
  the probable squad instead of failing allocation for the whole scope.

## 0.3.33 - 2026-08-26

### Fixed

- The forecast recalculation scheduler isolates per-league failures: a league
  whose provider statistics cannot support allocation (no player xG or
  recoveries recorded) no longer blocks recalculation of the other active
  leagues; it is logged and retried on the next cycle.

## 0.3.32 - 2026-08-26

### Added

- Fantasy model forecasts are now recalculated automatically: an in-process
  scheduler recomputes `XG_SHARE_V2` forecasts for every active league/season
  scope shortly after startup and then every six hours (configurable via
  `FANTASY_MODEL_FORECAST_SYNC_INTERVAL_HOURS`, disable with
  `FANTASY_MODEL_FORECAST_SYNC_ENABLED=false`). The manual
  `forecasts:recalculate-model` script remains available.

## 0.3.31 - 2026-08-26

### Changed

- Fantasy model forecasts now use the xg_share allocation: a player receives
  the team's next-match expected goals and assists in proportion to their
  blended share of the team's observed xG/xA (season weighted 0.6, last three
  team matches weighted 0.4). Shares are fractions of actual team totals, so
  part-time players can no longer be inflated beyond the team expectation.
- Model version bumped to `XG_SHARE_V2`; stored forecasts are recalculated
  under the new version on the next `forecasts:recalculate-model` run.
- Fixture breakdowns now persist the season/recent/blended shares used for
  the attack projection.

## 0.3.30 - 2026-08-25

### Changed

- Consensus weights rebalanced to trust the user's alternative formula first
  (0.5), then the external Foontasy number (0.3), with the primary projection
  as a stabilizing baseline (0.2).

## 0.3.29 - 2026-08-25

### Added

- Squad recommendations now run on a consensus engine that blends the primary
  projection, the user's alternative formula and the external Foontasy number
  (weights 0.5/0.2/0.3) instead of trusting a single model.
- Auto-pick "Reliable" strategy adds a rotation-risk floor guard on expected
  minutes and start probability; "Upside" caps the volatility bonus so junk
  minutes cannot masquerade as ceiling.
- Transfer suggestions weigh clamped recent-form tilt, confident low-owned
  differentials (Foontasy ownership now reaches the planner), and a small
  fixture-run tie-breaker; plans earn cross-model agreement and calendar-swing
  bonuses, flag differential picks in their reason, and the captain tie-break
  prefers ceiling volatility among equal next-round projections.

## 0.3.28 - 2026-08-25

### Added

- MiXerr shot maps gained an xG-weighted heat-map overlay built from the
  currently filtered shots, toggleable next to the goal/SOT filters and drawn
  under the shot markers with a legend swatch.

### Removed

- Assisted-pass attribution in MiXerr (top pass creators table, assist
  tooltips and shot DTO fields): FotMob only publishes passers on goal
  incidents, so per-shot attribution was misleadingly sparse.

## 0.3.27 - 2026-08-25

### Added

- MiXerr shot maps now attach the final passer to every assisted goal by
  joining the synced goal incidents, surface a "Top pass creators" table with
  assists and assisted xG below the top shooters table, and show the passer in
  each shot tooltip. FotMob publishes passers only for goals, so other shots
  stay unattributed.

## 0.3.26 - 2026-08-25

### Added

- Machete squad planning tables are archived per fantasy tour exactly one
  minute before the first kickoff. Tour boundaries come from the synced
  Sports.ru provider rounds, captures run on one precise timer per round, and
  the stored player pool is exportable with `npm run snapshots:squad` for
  comparing pre-deadline forecasts with real fantasy results.

## 0.3.25 - 2026-08-24

### Added

- Squad projections expose dedicated detail payloads and formula explanations
  without loading the complete player pool for every interaction.
- Release version verification now keeps `package.json`, `package-lock.json`,
  and the newest changelog entry synchronized and rejects unversioned change
  sets in CI.

### Changed

- Machete squad loading reuses bounded shared reads, preserves imported slots,
  and remains ready while fixture kickoffs move through the active window.
- Sports.ru mappings cover current Bundesliga and Serie A team names, and the
  Championship calendar uses the canonical fantasy route.
- Local spreadsheet working artifacts under `.codex_sheet_work` no longer
  pollute Git status.
- Repository text files are pinned to LF so Windows `core.autocrlf` settings
  cannot turn a small edit into a whole-file diff.

### Fixed

- Sports.ru squad imports can finish while the player pool is still loading.
- Sports.ru club limits now use one explicit CoreLeague-ID matrix, with three
  players allowed for both LaLiga and the Russian Premier League.
- Projection formula tooltips retain a readable bounded width.
- The production FPL relay now uses bounded Docker log rotation.

## 0.3.24 - 2026-08-20

### Changed

- Forecasts are aggregated across provider rounds before they are presented in
  the Machete planner and player table.
- Formula adaptation explanations distinguish official FPL scoring from the
  component projection model.

## 0.3.23 - 2026-08-20

### Fixed

- Sports.ru squad imports retain provider players that do not yet have an
  internal identity mapping, including their selections and prices.
- Applying an imported squad no longer loses unresolved players during planner
  normalization or reload.

## 0.3.22 - 2026-08-20

### Fixed

- Provider fixture team names are stored independently from canonical club
  names so later schedule and price refreshes preserve verified mappings.
- Sports.ru player matching reuses the persisted provider-team identity across
  fantasy synchronization and squad planning.

## 0.3.21 - 2026-08-20

### Added

- Versioned provider fantasy schedules and team-name mappings support
  provider-specific rounds across Sports.ru and FPL.
- The planner exposes roster and forecast coverage, while the FPL integration
  uses official names, scoring, and the production VPN relay.
- Audited Sports.ru mapping workflows cover current Ligue 1 teams and finalized
  player identities.

### Fixed

- Forecast minutes are scoped by competition, and a Foontasy refresh updates
  the active fantasy pool without requiring a reload.

## 0.3.20 - 2026-08-09

### Added

- The prepared Champions League UEFA assistant can now be imported into its
  own source namespace. It still fails closed unless at least 90 percent of
  its player IDs overlap the current Sports.ru phase and at least 90 percent
  resolve to internal players. The final URL must retain the UEFA marker and
  its normalized payload must differ from the companion Sports assistant, so
  an ignored query cannot create a mislabeled duplicate.

### Changed

- The legacy flat Foontasy round keys and their redundant query indexes are
  removed after the source-aware writer has occupied the rollback slot.
  Version 0.3.19 remains a compatible rollback because it already writes and
  reads the new source-aware identity.

## 0.3.19 - 2026-08-09

### Changed

- Foontasy forecasts and historical samples now use their source variant,
  Sports.ru phase, phase round, and player ID as the writer identity. The
  previous round-based unique keys remain alongside the new keys for one
  rollback-compatible release.
- Placeholder source fields are backfilled again immediately before the new
  keys are created, covering any rows written during a rollback to 0.3.17.
- UEFA writes remain closed until the previous writer has left the rollback
  slot and the old unique keys can be removed safely.

## 0.3.18 - 2026-08-09

### Added

- The Foontasy admin catalog now covers all ten published national assistants:
  RPL, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Eredivisie,
  Liga Portugal, Super Lig, and the Championship. Sports.ru price scopes cover
  the same leagues.
- Sports.ru Champions League, UEFA Champions League, Europa League, and World
  Cup Foontasy variants have distinct source identities. European cup scopes
  stay closed while the database still exposes an outdated current season;
  UEFA writes remain closed during the rollback-compatible schema expansion.
- Foontasy rows now retain their source variant, Sports.ru phase ID, original
  round label, phase round, and canonical round. Sports.ru price refreshes
  retain the tour history needed when European knockout phases restart at
  round one.

### Fixed

- Uncalculated Foontasy pages with hundreds of all-zero player rows are no
  longer accepted as successful imports. National leagues require at least
  100 calculated rows; cup stages use a lower adaptive floor so valid finals
  remain importable. Every scope still requires 90-percent current Sports.ru
  ID overlap and 90-percent internal mapping coverage before any write.
- A missing or unpublished assistant is reported as unavailable per league,
  without stopping the remaining selected scopes or replacing stored FFO.

## 0.3.17 - 2026-08-09

### Fixed

- Completed-match starter synchronization now accepts every non-empty FotMob
  lineup containing at most 11 unique starters. Partial source lineups replace
  the previous flags with the players actually present; empty or oversized
  lineups preserve the previous flags.

## 0.3.16 - 2026-08-09

### Fixed

- Sports.ru placeholder birth dates such as `0001-01-01` are now treated as
  missing identity evidence. They can no longer confirm or reject an automatic
  Sports.ru-to-FotMob player mapping.
- Correcting a false player link no longer moves a user's squad selection away
  from an identity that is still legitimately used by another Sports.ru price
  row.

## 0.3.15 - 2026-08-09

### Fixed

- Automatic Sports.ru player mapping now requires strong name identity when
  FotMob has no confirming birth date. Team and position bonuses can no longer
  turn weak pairs such as Lewis Orford / Lewis O'Brien into an accepted link.
- A conflicting provider birth date no longer rejects an otherwise exact
  player identity. The conflict remains visible in the candidate reason, while
  only near-exact names may pass this exception; this covers verified Sports.ru
  birthday errors without weakening namesake protection.

## 0.3.14 - 2026-08-09

### Added

- The ingestion admin page now has independent multi-league controls for
  Sports.ru price imports and Foontasy FFO imports. Each selected league is
  processed independently and reports its own result.
- Sports.ru current prices are supported for Spain, the Championship and
  Turkey, including explicit Sports.ru-to-FotMob club aliases and a guarded
  deep-mapping workflow.
- Sports.ru imports retain the provider stat-player identity and date of birth
  so poor transliterations and namesakes can be resolved without weakening the
  global matching threshold.

### Changed

- Routine price refreshes update source fields and prices but send only
  previously unmapped rows to identity matching. An accepted automatic or
  manual player mapping is no longer reinterpreted by a later refresh.
- A completed match now moves each team's starter flags to the eleven players
  who actually started that match. The update is chronological and idempotent;
  a ten-player or otherwise incomplete FotMob lineup preserves existing flags.

### Fixed

- The first completed match of a new round no longer clears starter flags for
  every team in the league.
- The production dependency graph pins patched `nanoid` 3.3.17, removing the
  high-severity infinite-loop advisory affecting earlier 3.x releases.

## 0.3.13 - 2026-08-05

### Fixed

- Fixture odds ingestion now keeps a match when at least one team has both
  required direct markets. A missing opponent team-total line no longer drops
  the complete favorite side from the bookmaker table or its FO forecast.
- Benfica versus Academico Viseu is retained with Benfica's available clean
  sheet and over-1.5 probabilities even while Fonbet does not quote the
  Academico Viseu over-1.5 team total.

## 0.3.12 - 2026-08-05

### Fixed

- A sparse club history can no longer allocate the complete team xG/xA to the
  only player with a non-zero event sample. The shared FO/Alt pipeline now
  reserves the missing allocation share for unmodelled teammates whenever a
  real roster has fewer than seven meaningful player exposures or fewer than
  360 aggregate event minutes. Complete team histories remain unchanged.
- Gabor Szalai's live Maritimo calculation now keeps his evidenced 38.9-minute
  share instead of inheriting the attack of 35 teammates without domestic
  history. The detailed tooltip exposes the player count, minute coverage, and
  reserved goal/assist weights used by this guard.
- Feeder-to-top-flight history adaptation is now shared by the supported
  national leagues instead of being hard-coded only for RPL and Eredivisie.
  Liga Portugal 2 is enabled with two completed seasons plus the upcoming
  season, allowing Maritimo's prior domestic minutes and event history to fill
  the current Liga Portugal roster after backfill.

## 0.3.11 - 2026-08-04

### Fixed

- Manual starting-XI marks now use the same role-aware per-90 protection in
  every league and in both FO and Alt. Accumulated substitute minutes no longer
  count as proof that a player's starter event rate is fully reliable.
- Goal and assist rates are blended toward a position prior when a player is
  manually promoted from a historically limited role. Stable starters remain
  unchanged, while low-minute outliers no longer take an implausible share of
  the team's projected goals.
- Detailed forecast tooltips expose sample reliability, historical-role
  reliability, the final event-minute exposure, and the before/after xG/xA
  rates used by the role adjustment.

## 0.3.10 - 2026-08-03

### Fixed

- Player goal and assist allocation now distinguishes a missing FotMob xG/xA
  value from an explicit zero. Where a competition does not publish xG/xA,
  the rolling formula uses that match's observed goals/assists as the best
  available allocation signal; supplied FotMob xG/xA remains authoritative.
- Promoted teams with complete basic statistics but unavailable player xG/xA
  no longer assign almost the entire team attack to one player who happens to
  have a small top-flight xG/xA sample. This fixes Jaden Slory's inflated Alt
  forecast at Willem II and applies equally to the Eerste Divisie-to-Eredivisie
  and FNL-to-RPL paths.
- Previous-club actual-event fallbacks retain the existing transfer penalty
  instead of cancelling it through the penalized-minutes denominator.

## 0.3.9 - 2026-08-03

### Changed

- Team roster pages with starting-XI controls now show the verified Sports.ru
  fantasy name as the primary player label. FotMob remains the internal player
  identity and is included in the name tooltip; rows without a confirmed
  Sports.ru mapping keep their FotMob name.

### Fixed

- A verified Sports.ru player now becomes an effective team-roster row on the
  starting-XI page even when FotMob keeps that player in a reserve/youth team
  or omits the senior-season roster. Ro-Zangelo Daal therefore appears for AZ
  Alkmaar instead of existing only as a price mapping.
- The starting-XI API can now persist such an authoritative Sports.ru roster
  row after validating the price, matched provider map, player, and team. A
  later FotMob roster refresh preserves the manual starter row until FotMob
  itself takes ownership of that exact player-team row.
- The mapping panel no longer reports `MATCHED` when neither the active FotMob
  roster nor a verified Sports.ru price resolves an effective player row;
  price foreign keys alone are no longer treated as proof of a match.

## 0.3.8 - 2026-08-03

### Fixed

- Removed Gustavo Sa's obsolete Famalicao mapping from the required 2026/27
  Liga Portugal plan. Sports.ru has removed the price row and FotMob now lists
  him outside Portugal, so the deployment script no longer fails while looking
  for a fantasy option that does not exist.

## 0.3.7 - 2026-08-03

### Added

- Sports.ru-only core identities for nine academy or reserve players in the
  Eredivisie and Liga Portugal price lists. They remain selectable for their
  verified senior fantasy club without fabricated FotMob history; missing
  match metrics are zero.
- An explicit transferred-out state for stale fantasy prices. Kian Fitz-Jim's
  Ajax row is retained for auditability but excluded from the Eredivisie pool
  after his permanent transfer to Torino.

### Fixed

- Verified club overrides now survive later price syncs. Rafik El Arguioui is
  assigned to Cambuur for his 2026/27 loan instead of being moved back to the
  stale Utrecht label published by Sports.ru.
- The remaining exact FotMob identities in the Netherlands and Portugal price
  lists, including Ro-Zangelo Daal, are stored as durable manual mappings
  instead of being cleared by the next scheduled Sports.ru import.

## 0.3.6 - 2026-08-02

### Fixed

- Mapped Sports.ru prices now define a player's current fantasy team when
  FotMob still exposes the previous club or omits the player from its active
  roster. Player form and minutes continue to use FotMob match history,
  including the existing previous-club fallback for new transfers.
- Squad forecasts, fixtures, team limits, saved selections, auto-pick, and
  transfer suggestions use the same Sports.ru-authoritative team assignment.
- A later Sports.ru price sync moves verified mappings to the newly published
  team instead of retaining the stale FotMob club.

## 0.3.5 - 2026-08-01

### Changed

- A successful production deployment now runs bounded artifact retention
  automatically instead of relying on a separate manual operator command.
- Production retains the active Fantasy image and exactly one stopped rollback;
  older rollback containers, images, and release directories are removed.
- BuildKit cache is capped at 1 GB after every successful production rollout.

## 0.3.4 - 2026-08-01

### Added

- Detailed FotMob ingestion for Eerste Divisie, including two complete feeder
  seasons, the upcoming-season calendar, and player-level payloads, as the
  feeder competition for Eredivisie.
- Eerste Divisie history in promoted-team strength profiles and promoted-player
  archive selection, matching the existing FNL-to-RPL path.

### Fixed

- Expected minutes now use every recent match played by the player's club,
  including explicit zero-minute observations when the player was absent from
  the match sheet. Previously those club matches disappeared from the
  denominator, so one isolated 90-minute cup appearance could produce a
  90-minute projection.
- A new signing now fills missing current-club history from the previous club's
  recent match calendar, including matches the player missed. The existing
  ten-percent transfer penalty remains applied; 365-day formula inputs use up
  to ten club matches while the visible last-five history remains five matches.
- Detailed five-plus-match club history now takes precedence over the coarse
  season archive for expected minutes. Short archive fallbacks use real FotMob
  season minutes when available instead of assuming 70 minutes per appearance.

## 0.3.1 - 2026-07-31

### Added

- A current-round Fonbet favorites table below transfer recommendations with
  separate de-vigged clean-sheet and team-over-1.5 probabilities.
- Honest empty-state handling when a fixture has no fresh complete bookmaker
  market for both teams.

### Changed

- The top three transfer recommendations use a denser three-column desktop
  layout with tighter cards, metrics, player rows, and controls.
- Each fixture favorite is selected by the higher available team-over-1.5
  probability; clean-sheet probability remains an independent displayed
  market and is used only as a tie-breaker.

## 0.3.0 - 2026-07-31

### Added

- Chromium and Firefox WebExtension packages that add a one-click
  `Fantasy -> Sports.ru` squad-transfer widget to football fantasy pages.
- A session-authenticated, no-store API that exports the user's latest saved
  squad with current Sports.ru player IDs.
- Atomic Sports.ru squad updates covering all 15 players, the starting XI,
  captain, vice-captain, and substitute priorities.

### Security

- The HttpOnly `fantasy_session` cookie is read only in the extension
  background context. The Sports.ru content script and page DOM never receive
  the session token.
- Extension host access is limited to `fantasy.tsyzhman.ru` and Sports.ru
  football fantasy pages; the extension contains no remote executable code
  and sends no telemetry.

### Changed

- Sports.ru contest metadata now stores the structured tournament HRU while
  retaining the existing source-URL fallback.

## 0.2.5 - 2026-07-30

### Changed

- The authenticated production browser journey now exercises the current RPL
  season explicitly instead of the pre-season EPL scope that has no Sports.ru
  prices or played matches yet.
- Browser checks follow the current accessible player-search controls and no
  longer expect the command palette component that is absent from the shell.

## 0.2.4 - 2026-07-30

### Fixed

- Auto-pick now uses the same operational source-data readiness gate as
  transfer suggestions. Audit-only warnings no longer disable a planner that
  has fresh player/fixture ingestion and real non-zero projections.
- The production squad journey reads the rendered league-season scope instead
  of waiting for the season selector that the current one-season UI no longer
  renders.

## 0.2.3 - 2026-07-30

### Fixed

- Sequential ingestion now isolates every league-season scope. A failed
  tournament or league is recorded in `scope_errors`, the shared job finishes
  as `completed_with_errors`, and later leagues continue updating normally.
- Successful league evidence remains usable for planner and transfer
  readiness even when another league in the same ingestion job fails.

## 0.2.2 - 2026-07-30

### Security

- Updated Next.js, PostCSS, Sharp, and vulnerable transitive
  `brace-expansion` versions reported by the production dependency audit.
  Legacy minimatch consumers use a callable compatibility adapter backed by
  the safe `brace-expansion` 5.0.9 implementation.

### Fixed

- Release manifests now store the semantic app version in `.release-version`
  and the timestamped deployment identifier separately in `.release-name`.
- Prisma now maps long forecast and archive index names to their existing
  PostgreSQL identifiers, so migration drift checks no longer request
  destructive no-op renames.

## 0.2.1 - 2026-07-30

### Fixed

- A lost deploy connection after a successful container swap can no longer
  delete the active immutable release directory or its image.
- A failure during the swap restores both the previous web/worker containers
  and the previous `current` symlink target.

## 0.2.0 - 2026-07-30

### Added

- Six retro-trained forecast columns for the player and squad tables:
  FO/Alt position calibration, Joint all, and Joint accepted.
- Short and detailed per-player formula explanations.
- Formula-aware FO, Alt, and FFO transfer suggestions.
- RPL transfer prioritization and the round-relative Foontasy scheduler.
- Commit and semantic-version identity in health responses and Docker images.
- Clean-source release verification, immutable Git archives, guarded Docker
  promotion, and persistent server-side production history.

### Changed

- Consolidated the formerly separate production line
  `4bf13c9 -> 96eb7ed -> 0db9e57` with the formula, ingestion, and retention
  work that had previously existed only in a local working tree.
- From June 5 through September 1, incremental FotMob jobs scan every enabled
  national league/division and skip tournament calendars.
- Supercopa de España remains explicitly disabled from shared ingestion.
- Release retention now keeps one immediate rollback for both web and worker.

### Fixed

- Detailed FotMob payloads can no longer erase authoritative fixture round,
  status, or score metadata.
- Versioned squad-table preferences containing formula columns remain readable
  across releases.
- Production can no longer be packaged from untracked or unpushed source.

## 0.1.0

- Initial tracked Fantasy Scout application line before consolidated
  production versioning.
