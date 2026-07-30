# Changelog

All production versions are built from Git commits and tagged after successful
promotion. Runtime identity is available from `/api/health` and from the OCI
image labels `org.opencontainers.image.version` and
`org.opencontainers.image.revision`.

## 0.2.2 - 2026-07-30

### Security

- Updated Next.js, PostCSS, Sharp, and vulnerable transitive
  `brace-expansion` versions reported by the production dependency audit.
  Legacy minimatch consumers use a callable compatibility adapter backed by
  the safe `brace-expansion` 5.0.9 implementation.

### Fixed

- Release manifests now store the semantic app version in `.release-version`
  and the timestamped deployment identifier separately in `.release-name`.

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
