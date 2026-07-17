# Data Model

The canonical schema is `prisma/schema.prisma`. Versioned SQL migrations in
`prisma/migrations` are the deployment source of truth. This document is a
map of the current model groups, not a full Prisma schema copy.

## Auth And Preferences

- `User`: application account with role, password hash, status, sessions, saved
  views, watchlist rows, and fantasy squads.
- `UserSession`: hashed cookie-session token with expiry.
- `AuthRateLimit`: persisted login/setup rate-limit buckets.
- `UserSavedView`: saved Machete or Baltika explorer URLs per user.
- `UserWatchlistPlayer`: watched player keys per user and source.

## Baltika And Legacy Wyscout Imports

These models support the Excel-imported scouting workflow.

- `League`, `Season`, `Team`: admin-managed Baltika/Wyscout league structure.
- `SourceFile`: uploaded workbook metadata and storage pointer.
- `TeamImport`: versioned player workbook import for a team and season.
- `Player`: canonical player identity for imported snapshots.
- `PlayerSnapshot`: typed imported player metrics, fantasy scores, model scores,
  starter flags, and current published explorer rows.
- `FantasyModel`, `FantasyModelRule`: configurable scoring models for imported
  player snapshots.
- `FantasyBacktestRun`: immutable-by-convention model evaluation record with
  model version/hash, season coverage, baseline and model MAE/RMSE, the full
  report, and the beta-gate result.
- `DataQualityAuditRun`: persisted forecast coverage, active-player and match
  coverage, basic-stat completeness, ingestion-promotion latency, model
  version/hash, and the data-quality gate result.
- `BaltikaTeamStatsImport`: versioned Wyscout Team Stats workbook import.
- `BaltikaFixture`: manual or imported Baltika fixture.
- `BaltikaTeamMatchStat`: team-level fixture statistics used for Baltika views.

The Wyscout import path is still active, but it is one mode of the app rather
than the whole product.

## Shared FotMob Core

These lower-case mapped tables are the normalized source for Machete and MiXerr.

- `CoreLeague`, `CoreTeam`, `CorePlayer`: provider identities for leagues,
  teams, and players.
- `LeagueSeason`: active season metadata per league.
- `LeagueSeasonTeam`: teams participating in a league season.
- `TeamPlayerSeason`: roster membership, position, starter status, nationality,
  age, and shirt data per league/team/player/season.
- `CoreMatch`: normalized match fixture and score row.
- `RawMatchPayload`: temporary or audit storage for fetched provider payloads.
- `MatchTeamStat`: normalized team match stats.
- `MatchPlayerStat`: normalized player match stats.
- `MatchShot`: normalized shot rows with 0-100 pitch coordinates and
  `sourceFingerprint`.
- `MatchEvent`: normalized match events.
- `FantasyRuleset`, `FantasyPoint`, `FantasyPointBreakdown`: normalized fantasy
  scoring outputs for shared match data.
- `IngestionRun`, `IngestionJob`, `IngestionCheckpoint`: operational state for
  initial backfills, incremental updates, retries, and progress display.

`MatchShot.sourceFingerprint` is required and unique with `matchId`. It lets the
importer upsert shots without storing full raw shot payloads in the normalized
table.

## Machete Models

Machete has legacy provider-state tables plus read-model snapshots.

- `MacheteLeague`, `MacheteTeam`, `MachetePlayer`, `MacheteFixture`: legacy
  FotMob shell entities used by Machete pages and sync jobs.
- `MachetePlayerMatchStat`: Machete-specific player fixture stats.
- `MachetePlayerSnapshot`: aggregate current or period-specific player rows with
  projection scores and value scores.
- `MacheteSyncJob`: status and result payloads for Machete sync endpoints.
- `MacheteRawPayload`: retained provider payloads for Machete-specific syncs.
- `ProviderEntityMap`: links provider ids to internal entities where automatic
  matching is not enough.

Current player explorer pages increasingly read from the shared FotMob core and
Machete read models instead of treating Wyscout snapshots as the primary source.

## Sports.ru Prices And Squads

- `SportsRuFantasyContest`: league/season fantasy contest settings, such as
  budget, squad size, and max players per team.
- `FantasyPlayerPrice`: imported Sports.ru price rows and optional mapping to
  normalized FotMob players and teams.
- `UserFantasySquad`: a named saved squad variant. A user can keep multiple
  variants for the same league and season and select them by id.
- `UserFantasySquadPlayer`: selected squad players with starter, lock, captain,
  vice-captain, slot, and purchase-price fields.

Database constraints enforce a unique variant name per user/league/season and
one player per squad. Application validation enforces budget, roster shape,
team limits, and captain/vice-captain roles before persistence.

## Moderated Beta Measurement

- `BetaTestRun`: one opt-in moderated journey tied internally to a user for
  distinct-participant counting. Stores device class, synthetic exclusion,
  server-recorded submission time, moderator judgments and timestamps; it does
  not copy account email or name. A valid review requires `submittedAt`.
- `BetaTestObservation`: bounded allowlisted milestone, pathname page-view, Web
  Vital, or coarse client-error observation. The unique run/kind/name/route key
  makes client retries idempotent.

Synthetic runs, invalid runs and unreviewed runs never satisfy the user gate.
The aggregate report uses only the first moderator-approved valid run per
distinct user and omits internal user IDs.

## Shot-Map Support

- `ShotmapPreset`: saved shot-map configuration.
- `ShotmapComparisonsCache`: cached comparison results and source-match ids.

MiXerr and player/team shot-map views read from `MatchShot`, `MatchTeamStat`,
`MatchPlayerStat`, and `CoreMatch`.

## Migration Notes

Fresh databases are created with:

```bash
npm run prisma:migrate:deploy
```

Existing production databases from before Prisma migrations must be backed up,
baselined with `000001_init`, and then upgraded with deploy migrations. The
`000002_runtime_schema_cleanup` migration moved historical runtime schema
mutation and data repair into versioned SQL. `000003_multiple_fantasy_squads`
preserves existing squads while replacing the single-squad unique key with a
named-variant key.
`000004_fantasy_backtest_runs` adds the persisted registry for reproducible
historical model evaluations.
`000005_data_quality_audit_runs` adds persisted forecast/data coverage and
promotion-latency audits.
`000006_beta_test_telemetry` adds opt-in moderated beta runs and bounded
observations; it does not enable collection for ordinary navigation. On
2026-07-15 it was restore-tested against a production backup; `migrate deploy`
was run twice on the disposable database and the second run reported no pending
migrations, then it was applied once to production.
`000007_match_promotion_timestamps` adds the atomic raw-received/normalized
timing pair and its ordering constraint without backfilling historical values.
It was applied on 2026-07-16 after a verified production backup, followed by a
real 380-match refresh.
`000008_beta_test_moderated_environment` adds nullable structured moderator
environment evidence and a database allowlist CHECK. It was applied on
2026-07-16 after a custom-format backup verified with `pg_restore --list`.
`000009_beta_test_submission` is an expand-only migration that adds nullable,
server-recorded `submittedAt`. It deliberately performs no historical backfill
and adds no constraint: a moderator review is not evidence that the participant
submitted the run. Legacy reviewed rows therefore remain `submittedAt = null`,
block the gate when marked valid, and are excluded from valid/primary participant
counts. It was applied to production on 2026-07-17 from the exact beta39 setup
image, after a custom-format backup verified with `pg_restore --list`;
production then reported 9 applied migrations, zero failed migrations, and
unchanged application row counts.
`000010_beta_test_submission_contract` adds a bounded-lock `CHECK ... NOT VALID`
contract: new or updated real runs cannot be marked valid without `submittedAt`.
It performs no backfill and deliberately does not validate historical rows, so
no submission provenance is fabricated. Historical violations remain an explicit
gate blocker until resolved from real evidence.
