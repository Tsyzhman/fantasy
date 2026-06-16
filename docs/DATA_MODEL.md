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
- `UserFantasySquad`: one saved squad per user, league, and season.
- `UserFantasySquadPlayer`: selected squad players with starter, lock, captain,
  vice-captain, slot, and purchase-price fields.

Database constraints enforce one squad per user/league/season, one player per
squad, and distinct captain/vice-captain choices.

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
mutation and data repair into versioned SQL.
