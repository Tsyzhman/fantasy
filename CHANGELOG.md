# Changelog

All production versions are built from Git commits and tagged after successful
promotion. Runtime identity is available from `/api/health` and from the OCI
image labels `org.opencontainers.image.version` and
`org.opencontainers.image.revision`.

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
