# Changelog

All production versions are built from Git commits and tagged after successful
promotion. Runtime identity is available from `/api/health` and from the OCI
image labels `org.opencontainers.image.version` and
`org.opencontainers.image.revision`.

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
