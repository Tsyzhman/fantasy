-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('EMPTY', 'UPLOADING', 'PARSING', 'VALIDATED', 'READY', 'PUBLISHED', 'ERROR', 'OUTDATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('WYSCOUT_EXCEL', 'API_FOOTBALL', 'WYSCOUT_API', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "code" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "sourceType" "DataSourceType" NOT NULL DEFAULT 'WYSCOUT_EXCEL',
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamImport" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PARSING',
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "detectedTeamName" TEXT,
    "rowsCount" INTEGER NOT NULL DEFAULT 0,
    "columnsCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "warningsJson" JSONB,
    "isCurrentPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "birthCountry" TEXT,
    "passportCountry" TEXT,
    "foot" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSnapshot" (
    "id" TEXT NOT NULL,
    "teamImportId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "playerName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "positionRaw" TEXT,
    "positionGroup" TEXT,
    "age" INTEGER,
    "marketValue" INTEGER,
    "contractExpires" TIMESTAMP(3),
    "matchesPlayed" INTEGER,
    "minutesPlayed" INTEGER,
    "goals" DOUBLE PRECISION,
    "xg" DOUBLE PRECISION,
    "assists" DOUBLE PRECISION,
    "xa" DOUBLE PRECISION,
    "birthCountry" TEXT,
    "passportCountry" TEXT,
    "foot" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "onLoan" BOOLEAN,
    "fantasyScore" DOUBLE PRECISION,
    "scoringScore" DOUBLE PRECISION,
    "alternativeScore" DOUBLE PRECISION,
    "valueScore" DOUBLE PRECISION,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "fantasy_assists" INTEGER,
    "clean_sheets" INTEGER,
    "saves" INTEGER,
    "penalty_saves" INTEGER,
    "recoveries" INTEGER,
    "penalties_conceded" INTEGER,
    "missed_penalties" INTEGER,
    "own_goals" INTEGER,
    "goals_conceded" INTEGER,
    "shots_on_target" INTEGER,
    "key_passes" INTEGER,
    "tackles_won" INTEGER,
    "interceptions" INTEGER,
    "clearances" INTEGER,
    "yellow_cards" INTEGER,
    "red_cards" INTEGER,
    "average_rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyModel" (
    "id" TEXT NOT NULL,
    "modelSource" TEXT NOT NULL DEFAULT 'WYSCOUT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customFormula" TEXT,
    "customFormulaGk" TEXT,
    "customFormulaDef" TEXT,
    "customFormulaMid" TEXT,
    "customFormulaFwd" TEXT,
    "customFormulaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scoringFormulaGk" TEXT,
    "scoringFormulaDef" TEXT,
    "scoringFormulaMid" TEXT,
    "scoringFormulaFwd" TEXT,
    "scoringFormulaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alternativeFormulaGk" TEXT,
    "alternativeFormulaDef" TEXT,
    "alternativeFormulaMid" TEXT,
    "alternativeFormulaFwd" TEXT,
    "alternativeFormulaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FantasyModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyModelRule" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "positionGroup" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "transform" TEXT NOT NULL DEFAULT 'linear',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FantasyModelRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacheteLeague" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "providerLeagueId" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "season" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacheteLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacheteTeam" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "providerTeamId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "country" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacheteTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachetePlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "providerPlayerId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "age" INTEGER,
    "nationality" TEXT,
    "height" TEXT,
    "foot" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachetePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacheteFixture" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "providerFixtureId" TEXT,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "kickoffAt" TIMESTAMP(3),
    "status" TEXT,
    "round" TEXT,
    "aggregate_season" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacheteFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "raw_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "ccode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "raw_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "birth_date" DATE,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "raw_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_ru_fantasy_contests" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "provider_contest_id" TEXT,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "budget_limit" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "squad_size" INTEGER NOT NULL DEFAULT 15,
    "max_players_per_team" INTEGER NOT NULL DEFAULT 2,
    "rules" JSONB,
    "source_url" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_ru_fantasy_contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_player_prices" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT,
    "player_id" BIGINT,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "provider_player_id" TEXT,
    "player_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "team_name" TEXT NOT NULL DEFAULT '',
    "sports_team_name" TEXT,
    "fotmob_player_name" TEXT,
    "position_label" TEXT,
    "source_kind" TEXT,
    "source_row_index" INTEGER,
    "position" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_player_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fantasy_squads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My squad',
    "budget_limit" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "bank" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "horizon_rounds" INTEGER NOT NULL DEFAULT 5,
    "filters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_fantasy_squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fantasy_squad_players" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "team_id" BIGINT,
    "position" TEXT,
    "is_starter" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_captain" BOOLEAN NOT NULL DEFAULT false,
    "is_vice_captain" BOOLEAN NOT NULL DEFAULT false,
    "slot_index" INTEGER NOT NULL DEFAULT 0,
    "purchase_price" DOUBLE PRECISION,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_fantasy_squad_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_saved_views" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "filters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_watchlist_players" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "player_key" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "team_name" TEXT,
    "position" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_watchlist_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_seasons" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "calendar_type" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "provider_season" TEXT,
    "name" TEXT,
    "country" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_seasons_pkey" PRIMARY KEY ("league_id","season")
);

-- CreateTable
CREATE TABLE "league_season_teams" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_season_teams_pkey" PRIMARY KEY ("league_id","season","team_id")
);

-- CreateTable
CREATE TABLE "team_player_seasons" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_starter" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "shirt_number" INTEGER,
    "nationality" TEXT,
    "age" INTEGER,
    "photo_url" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_player_seasons_pkey" PRIMARY KEY ("league_id","season","team_id","player_id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" BIGINT NOT NULL,
    "league_id" BIGINT,
    "season" TEXT,
    "round" TEXT,
    "home_team_id" BIGINT,
    "away_team_id" BIGINT,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" TEXT,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "match_date" TIMESTAMP(3),
    "utc_time" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "source_url" TEXT,
    "raw_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_match_payloads" (
    "match_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parser_version" TEXT,
    "schema_version" TEXT,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_match_payloads_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "match_team_stats" (
    "match_id" BIGINT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "opponent_team_id" BIGINT,
    "is_home" BOOLEAN,
    "goals" INTEGER,
    "xg" DOUBLE PRECISION,
    "xgot" DOUBLE PRECISION,
    "xa" DOUBLE PRECISION,
    "shots" INTEGER,
    "shots_on_target" INTEGER,
    "shots_off_target" INTEGER,
    "blocked_shots" INTEGER,
    "big_chances" INTEGER,
    "big_chances_missed" INTEGER,
    "touches_in_opp_box" INTEGER,
    "possession" DOUBLE PRECISION,
    "passes" INTEGER,
    "accurate_passes" INTEGER,
    "pass_accuracy" DOUBLE PRECISION,
    "corners" INTEGER,
    "offsides" INTEGER,
    "fouls" INTEGER,
    "yellow_cards" INTEGER,
    "red_cards" INTEGER,
    "tackles_won" INTEGER,
    "interceptions" INTEGER,
    "clearances" INTEGER,
    "saves" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_team_stats_pkey" PRIMARY KEY ("match_id","team_id")
);

-- CreateTable
CREATE TABLE "match_player_stats" (
    "match_id" BIGINT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "team_id" BIGINT,
    "opponent_team_id" BIGINT,
    "is_home" BOOLEAN,
    "started" BOOLEAN,
    "substituted_in" BOOLEAN,
    "substituted_out" BOOLEAN,
    "minutes" INTEGER,
    "position" TEXT,
    "shirt_number" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "yellow_cards" INTEGER,
    "red_cards" INTEGER,
    "saves" INTEGER,
    "goals_conceded" INTEGER,
    "clean_sheet" BOOLEAN,
    "xg" DOUBLE PRECISION,
    "xgot" DOUBLE PRECISION,
    "xa" DOUBLE PRECISION,
    "shots" INTEGER,
    "shots_on_target" INTEGER,
    "key_passes" INTEGER,
    "chances_created" INTEGER,
    "tackles_won" INTEGER,
    "interceptions" INTEGER,
    "clearances" INTEGER,
    "duels_won" INTEGER,
    "aerials_won" INTEGER,
    "recoveries" INTEGER,
    "touches_in_opp_box" INTEGER,
    "fouls_won" INTEGER,
    "penalties_won" INTEGER,
    "rating" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_player_stats_pkey" PRIMARY KEY ("match_id","player_id")
);

-- CreateTable
CREATE TABLE "match_shots" (
    "id" BIGSERIAL NOT NULL,
    "match_id" BIGINT NOT NULL,
    "team_id" BIGINT,
    "opponent_team_id" BIGINT,
    "player_id" BIGINT,
    "is_home" BOOLEAN,
    "minute" INTEGER,
    "added_time" INTEGER,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    -- Stored as 0-100 pitch percentages, not meters.
    "normalized_x" DOUBLE PRECISION,
    "normalized_y" DOUBLE PRECISION,
    "event_type" TEXT,
    "shot_type" TEXT,
    "body_part" TEXT,
    "situation" TEXT,
    "is_goal" BOOLEAN NOT NULL DEFAULT false,
    "is_on_target" BOOLEAN,
    "is_blocked" BOOLEAN,
    "is_big_chance" BOOLEAN,
    "xg" DOUBLE PRECISION,
    "xgot" DOUBLE PRECISION,
    "source_fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" BIGSERIAL NOT NULL,
    "match_id" BIGINT NOT NULL,
    "team_id" BIGINT,
    "player_id" BIGINT,
    "related_player_id" BIGINT,
    "minute" INTEGER,
    "added_time" INTEGER,
    "event_type" TEXT,
    "event_subtype" TEXT,
    "is_goal" BOOLEAN NOT NULL DEFAULT false,
    "is_assist" BOOLEAN NOT NULL DEFAULT false,
    "is_own_goal" BOOLEAN NOT NULL DEFAULT false,
    "is_penalty" BOOLEAN NOT NULL DEFAULT false,
    "is_card" BOOLEAN NOT NULL DEFAULT false,
    "is_substitution" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_rulesets" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_points" (
    "match_id" BIGINT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "team_id" BIGINT,
    "ruleset_id" BIGINT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fantasy_points_pkey" PRIMARY KEY ("match_id","player_id","ruleset_id")
);

-- CreateTable
CREATE TABLE "fantasy_point_breakdown" (
    "match_id" BIGINT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "ruleset_id" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "points" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_point_breakdown_pkey" PRIMARY KEY ("match_id","player_id","ruleset_id","category")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "job_type" TEXT NOT NULL,
    "league_id" BIGINT,
    "season" TEXT,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "matches_discovered" INTEGER NOT NULL DEFAULT 0,
    "matches_fetched" INTEGER NOT NULL DEFAULT 0,
    "matches_skipped" INTEGER NOT NULL DEFAULT 0,
    "matches_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_by_user_id" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "total_scopes" INTEGER NOT NULL DEFAULT 0,
    "processed_scopes" INTEGER NOT NULL DEFAULT 0,
    "total_matches" INTEGER NOT NULL DEFAULT 0,
    "fetched_matches" INTEGER NOT NULL DEFAULT 0,
    "skipped_matches" INTEGER NOT NULL DEFAULT 0,
    "failed_matches" INTEGER NOT NULL DEFAULT 0,
    "current_league_id" BIGINT,
    "current_season" TEXT,
    "current_match_id" BIGINT,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_checkpoints" (
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "job_type" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "last_processed_match_id" BIGINT,
    "last_processed_date" TIMESTAMP(3),
    "cursor" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_checkpoints_pkey" PRIMARY KEY ("source","job_type","league_id","season")
);

-- CreateTable
CREATE TABLE "shotmap_presets" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shotmap_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shotmap_comparisons_cache" (
    "cache_key" TEXT NOT NULL,
    "query_params" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "source_match_ids" JSONB NOT NULL,
    "payload_hashes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shotmap_comparisons_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateTable
CREATE TABLE "MachetePlayerMatchStat" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT,
    "minutes" INTEGER,
    "rating" DOUBLE PRECISION,
    "goals" INTEGER,
    "assists" INTEGER,
    "shots" INTEGER,
    "shotsOnTarget" INTEGER,
    "keyPasses" INTEGER,
    "tackles" INTEGER,
    "interceptions" INTEGER,
    "saves" INTEGER,
    "yellowCards" INTEGER,
    "redCards" INTEGER,
    "aggregateMatches" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachetePlayerMatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachetePlayerSnapshot" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "leagueId" TEXT,
    "teamId" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "position" TEXT,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "minutesPlayed" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shotsOnTarget" INTEGER NOT NULL DEFAULT 0,
    "keyPasses" INTEGER NOT NULL DEFAULT 0,
    "tackles" INTEGER NOT NULL DEFAULT 0,
    "interceptions" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "fantasyScore" DOUBLE PRECISION,
    "scoringScore" DOUBLE PRECISION,
    "alternativeScore" DOUBLE PRECISION,
    "valueScore" DOUBLE PRECISION,
    "appearances60" INTEGER NOT NULL DEFAULT 0,
    "fullMatches" INTEGER NOT NULL DEFAULT 0,
    "expectedMinutes" DOUBLE PRECISION,
    "providerSeasonStatsIgnored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachetePlayerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacheteSyncJob" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT,
    "teamId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacheteSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacheteRawPayload" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "entityType" TEXT NOT NULL,
    "providerEntityId" TEXT,
    "endpoint" TEXT,
    "payload" JSONB NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacheteRawPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEntityMap" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEntityType" TEXT NOT NULL,
    "providerEntityId" TEXT NOT NULL,
    "internalEntityType" TEXT NOT NULL,
    "internalEntityId" TEXT,
    "confidence" DOUBLE PRECISION,
    "matchedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderEntityMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaltikaTeamStatsImport" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PARSING',
    "rowsCount" INTEGER NOT NULL DEFAULT 0,
    "fixturesCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "warningsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaltikaTeamStatsImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaltikaFixture" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "importId" TEXT,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT,
    "roundNumber" INTEGER,
    "kickoffAt" TIMESTAMP(3),
    "competition" TEXT,
    "durationMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLAYED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeXg" DOUBLE PRECISION,
    "awayXg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaltikaFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaltikaTeamMatchStat" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponentTeamId" TEXT,
    "side" TEXT NOT NULL,
    "goals" INTEGER,
    "xg" DOUBLE PRECISION,
    "xga" DOUBLE PRECISION,
    "shots" INTEGER,
    "shotsOnTarget" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaltikaTeamMatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_name_key" ON "Season"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leagueId_slug_key" ON "Team"("leagueId", "slug");

-- CreateIndex
CREATE INDEX "SourceFile_checksum_idx" ON "SourceFile"("checksum");

-- CreateIndex
CREATE INDEX "TeamImport_leagueId_seasonId_teamId_status_idx" ON "TeamImport"("leagueId", "seasonId", "teamId", "status");

-- CreateIndex
CREATE INDEX "TeamImport_teamId_isCurrentPublished_idx" ON "TeamImport"("teamId", "isCurrentPublished");

-- CreateIndex
CREATE INDEX "Player_normalizedName_idx" ON "Player"("normalizedName");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_leagueId_seasonId_teamId_idx" ON "PlayerSnapshot"("leagueId", "seasonId", "teamId");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_positionGroup_idx" ON "PlayerSnapshot"("positionGroup");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_fantasyScore_idx" ON "PlayerSnapshot"("fantasyScore");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_scoringScore_idx" ON "PlayerSnapshot"("scoringScore");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_alternativeScore_idx" ON "PlayerSnapshot"("alternativeScore");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_valueScore_idx" ON "PlayerSnapshot"("valueScore");

-- CreateIndex
CREATE INDEX "PlayerSnapshot_isStarter_idx" ON "PlayerSnapshot"("isStarter");

-- CreateIndex
CREATE INDEX "FantasyModel_modelSource_isDefault_isActive_idx" ON "FantasyModel"("modelSource", "isDefault", "isActive");

-- CreateIndex
CREATE INDEX "FantasyModelRule_modelId_positionGroup_idx" ON "FantasyModelRule"("modelId", "positionGroup");

-- CreateIndex
CREATE UNIQUE INDEX "MacheteLeague_providerLeagueId_key" ON "MacheteLeague"("providerLeagueId");

-- CreateIndex
CREATE INDEX "MacheteTeam_leagueId_status_idx" ON "MacheteTeam"("leagueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MacheteTeam_provider_providerTeamId_key" ON "MacheteTeam"("provider", "providerTeamId");

-- CreateIndex
CREATE INDEX "MachetePlayer_teamId_idx" ON "MachetePlayer"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MachetePlayer_provider_providerPlayerId_key" ON "MachetePlayer"("provider", "providerPlayerId");

-- CreateIndex
CREATE INDEX "MacheteFixture_leagueId_kickoffAt_idx" ON "MacheteFixture"("leagueId", "kickoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "MacheteFixture_provider_providerFixtureId_key" ON "MacheteFixture"("provider", "providerFixtureId");

-- CreateIndex
CREATE INDEX "leagues_source_raw_ref_idx" ON "leagues"("source", "raw_ref");

-- CreateIndex
CREATE INDEX "teams_source_raw_ref_idx" ON "teams"("source", "raw_ref");

-- CreateIndex
CREATE INDEX "players_source_raw_ref_idx" ON "players"("source", "raw_ref");

-- CreateIndex
CREATE INDEX "sports_ru_fantasy_contests_league_id_season_idx" ON "sports_ru_fantasy_contests"("league_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "sports_ru_fantasy_contests_provider_league_id_season_key" ON "sports_ru_fantasy_contests"("provider", "league_id", "season");

-- CreateIndex
CREATE INDEX "fantasy_player_prices_player_id_league_id_season_idx" ON "fantasy_player_prices"("player_id", "league_id", "season");

-- CreateIndex
CREATE INDEX "fantasy_player_prices_team_id_league_id_season_idx" ON "fantasy_player_prices"("team_id", "league_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_player_prices_provider_league_id_season_normalized__key" ON "fantasy_player_prices"("provider", "league_id", "season", "normalized_name", "team_name");

-- CreateIndex
CREATE INDEX "user_fantasy_squads_league_id_season_idx" ON "user_fantasy_squads"("league_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "user_fantasy_squads_user_id_league_id_season_key" ON "user_fantasy_squads"("user_id", "league_id", "season");

-- CreateIndex
CREATE INDEX "user_fantasy_squad_players_player_id_idx" ON "user_fantasy_squad_players"("player_id");

-- CreateIndex
CREATE INDEX "user_fantasy_squad_players_team_id_idx" ON "user_fantasy_squad_players"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_fantasy_squad_players_squad_id_player_id_key" ON "user_fantasy_squad_players"("squad_id", "player_id");

-- CreateIndex
CREATE INDEX "user_saved_views_user_id_source_updated_at_idx" ON "user_saved_views"("user_id", "source", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_saved_views_user_id_source_href_key" ON "user_saved_views"("user_id", "source", "href");

-- CreateIndex
CREATE INDEX "user_watchlist_players_user_id_source_updated_at_idx" ON "user_watchlist_players"("user_id", "source", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_watchlist_players_user_id_source_player_key_key" ON "user_watchlist_players"("user_id", "source", "player_key");

-- CreateIndex
CREATE INDEX "league_seasons_source_is_current_idx" ON "league_seasons"("source", "is_current");

-- CreateIndex
CREATE INDEX "league_season_teams_team_id_league_id_season_idx" ON "league_season_teams"("team_id", "league_id", "season");

-- CreateIndex
CREATE INDEX "team_player_seasons_player_id_league_id_season_idx" ON "team_player_seasons"("player_id", "league_id", "season");

-- CreateIndex
CREATE INDEX "team_player_seasons_team_id_league_id_season_idx" ON "team_player_seasons"("team_id", "league_id", "season");

-- CreateIndex
CREATE INDEX "team_player_seasons_is_starter_idx" ON "team_player_seasons"("is_starter");

-- CreateIndex
CREATE INDEX "idx_matches_league_season" ON "matches"("league_id", "season");

-- CreateIndex
CREATE INDEX "idx_matches_finished_date" ON "matches"("finished", "match_date");

-- CreateIndex
CREATE INDEX "idx_matches_home_team_date" ON "matches"("home_team_id", "match_date");

-- CreateIndex
CREATE INDEX "idx_matches_away_team_date" ON "matches"("away_team_id", "match_date");

-- CreateIndex
CREATE INDEX "matches_source_raw_ref_idx" ON "matches"("source", "raw_ref");

-- CreateIndex
CREATE INDEX "raw_match_payloads_source_is_final_idx" ON "raw_match_payloads"("source", "is_final");

-- CreateIndex
CREATE INDEX "idx_team_stats_team_match" ON "match_team_stats"("team_id", "match_id");

-- CreateIndex
CREATE INDEX "idx_player_stats_player_match" ON "match_player_stats"("player_id", "match_id");

-- CreateIndex
CREATE INDEX "idx_player_stats_team_match" ON "match_player_stats"("team_id", "match_id");

-- CreateIndex
CREATE INDEX "idx_shots_team_match" ON "match_shots"("team_id", "match_id");

-- CreateIndex
CREATE INDEX "idx_shots_opponent_match" ON "match_shots"("opponent_team_id", "match_id");

-- CreateIndex
CREATE INDEX "idx_shots_player_match" ON "match_shots"("player_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_shots_match_id_source_fingerprint_key" ON "match_shots"("match_id", "source_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "match_shots_match_id_team_id_player_id_minute_added_time_x__key" ON "match_shots"("match_id", "team_id", "player_id", "minute", "added_time", "x", "y", "event_type");

-- CreateIndex
CREATE INDEX "idx_events_match" ON "match_events"("match_id");

-- CreateIndex
CREATE INDEX "idx_events_player" ON "match_events"("player_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_match_id_team_id_player_id_minute_added_time_e_key" ON "match_events"("match_id", "team_id", "player_id", "minute", "added_time", "event_type", "event_subtype");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_rulesets_name_version_key" ON "fantasy_rulesets"("name", "version");

-- CreateIndex
CREATE INDEX "idx_fantasy_player_ruleset" ON "fantasy_points"("player_id", "ruleset_id");

-- CreateIndex
CREATE INDEX "idx_fantasy_team_match" ON "fantasy_points"("team_id", "match_id");

-- CreateIndex
CREATE INDEX "ingestion_runs_source_job_type_status_idx" ON "ingestion_runs"("source", "job_type", "status");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_updated_at_idx" ON "ingestion_jobs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "ingestion_jobs_job_type_status_idx" ON "ingestion_jobs"("job_type", "status");

-- CreateIndex
CREATE INDEX "shotmap_comparisons_cache_expires_at_idx" ON "shotmap_comparisons_cache"("expires_at");

-- CreateIndex
CREATE INDEX "MachetePlayerMatchStat_playerId_idx" ON "MachetePlayerMatchStat"("playerId");

-- CreateIndex
CREATE INDEX "MachetePlayerMatchStat_teamId_idx" ON "MachetePlayerMatchStat"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MachetePlayerMatchStat_fixtureId_playerId_key" ON "MachetePlayerMatchStat"("fixtureId", "playerId");

-- CreateIndex
CREATE INDEX "MachetePlayerSnapshot_leagueId_teamId_idx" ON "MachetePlayerSnapshot"("leagueId", "teamId");

-- CreateIndex
CREATE INDEX "MachetePlayerSnapshot_fantasyScore_idx" ON "MachetePlayerSnapshot"("fantasyScore");

-- CreateIndex
CREATE INDEX "MachetePlayerSnapshot_scoringScore_idx" ON "MachetePlayerSnapshot"("scoringScore");

-- CreateIndex
CREATE INDEX "MachetePlayerSnapshot_alternativeScore_idx" ON "MachetePlayerSnapshot"("alternativeScore");

-- CreateIndex
CREATE INDEX "MacheteSyncJob_leagueId_teamId_status_idx" ON "MacheteSyncJob"("leagueId", "teamId", "status");

-- CreateIndex
CREATE INDEX "MacheteSyncJob_createdAt_idx" ON "MacheteSyncJob"("createdAt");

-- CreateIndex
CREATE INDEX "MacheteRawPayload_provider_entityType_providerEntityId_idx" ON "MacheteRawPayload"("provider", "entityType", "providerEntityId");

-- CreateIndex
CREATE INDEX "MacheteRawPayload_checksum_idx" ON "MacheteRawPayload"("checksum");

-- CreateIndex
CREATE INDEX "ProviderEntityMap_internalEntityType_internalEntityId_idx" ON "ProviderEntityMap"("internalEntityType", "internalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEntityMap_provider_providerEntityType_providerEntit_key" ON "ProviderEntityMap"("provider", "providerEntityType", "providerEntityId", "internalEntityType");

-- CreateIndex
CREATE INDEX "BaltikaTeamStatsImport_leagueId_seasonId_teamId_status_idx" ON "BaltikaTeamStatsImport"("leagueId", "seasonId", "teamId", "status");

-- CreateIndex
CREATE INDEX "BaltikaTeamStatsImport_teamId_createdAt_idx" ON "BaltikaTeamStatsImport"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "BaltikaFixture_leagueId_seasonId_roundNumber_idx" ON "BaltikaFixture"("leagueId", "seasonId", "roundNumber");

-- CreateIndex
CREATE INDEX "BaltikaFixture_leagueId_seasonId_kickoffAt_idx" ON "BaltikaFixture"("leagueId", "seasonId", "kickoffAt");

-- CreateIndex
CREATE INDEX "BaltikaFixture_homeTeamId_kickoffAt_idx" ON "BaltikaFixture"("homeTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "BaltikaFixture_awayTeamId_kickoffAt_idx" ON "BaltikaFixture"("awayTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "BaltikaTeamMatchStat_teamId_side_idx" ON "BaltikaTeamMatchStat"("teamId", "side");

-- CreateIndex
CREATE INDEX "BaltikaTeamMatchStat_opponentTeamId_idx" ON "BaltikaTeamMatchStat"("opponentTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "BaltikaTeamMatchStat_fixtureId_teamId_key" ON "BaltikaTeamMatchStat"("fixtureId", "teamId");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamImport" ADD CONSTRAINT "TeamImport_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamImport" ADD CONSTRAINT "TeamImport_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamImport" ADD CONSTRAINT "TeamImport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamImport" ADD CONSTRAINT "TeamImport_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSnapshot" ADD CONSTRAINT "PlayerSnapshot_teamImportId_fkey" FOREIGN KEY ("teamImportId") REFERENCES "TeamImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSnapshot" ADD CONSTRAINT "PlayerSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSnapshot" ADD CONSTRAINT "PlayerSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSnapshot" ADD CONSTRAINT "PlayerSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSnapshot" ADD CONSTRAINT "PlayerSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyModelRule" ADD CONSTRAINT "FantasyModelRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "FantasyModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteTeam" ADD CONSTRAINT "MacheteTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "MacheteLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachetePlayer" ADD CONSTRAINT "MachetePlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "MacheteTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteFixture" ADD CONSTRAINT "MacheteFixture_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "MacheteLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteFixture" ADD CONSTRAINT "MacheteFixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "MacheteTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteFixture" ADD CONSTRAINT "MacheteFixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "MacheteTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_ru_fantasy_contests" ADD CONSTRAINT "sports_ru_fantasy_contests_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fantasy_squads" ADD CONSTRAINT "user_fantasy_squads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fantasy_squads" ADD CONSTRAINT "user_fantasy_squads_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "user_fantasy_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watchlist_players" ADD CONSTRAINT "user_watchlist_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_seasons" ADD CONSTRAINT "league_seasons_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_season_teams" ADD CONSTRAINT "league_season_teams_league_id_season_fkey" FOREIGN KEY ("league_id", "season") REFERENCES "league_seasons"("league_id", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_season_teams" ADD CONSTRAINT "league_season_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_player_seasons" ADD CONSTRAINT "team_player_seasons_league_id_season_team_id_fkey" FOREIGN KEY ("league_id", "season", "team_id") REFERENCES "league_season_teams"("league_id", "season", "team_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_player_seasons" ADD CONSTRAINT "team_player_seasons_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_player_seasons" ADD CONSTRAINT "team_player_seasons_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_match_payloads" ADD CONSTRAINT "raw_match_payloads_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_opponent_team_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_opponent_team_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_opponent_team_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_related_player_id_fkey" FOREIGN KEY ("related_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points" ADD CONSTRAINT "fantasy_points_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points" ADD CONSTRAINT "fantasy_points_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points" ADD CONSTRAINT "fantasy_points_match_id_player_id_fkey" FOREIGN KEY ("match_id", "player_id") REFERENCES "match_player_stats"("match_id", "player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points" ADD CONSTRAINT "fantasy_points_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "fantasy_rulesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_point_breakdown" ADD CONSTRAINT "fantasy_point_breakdown_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_point_breakdown" ADD CONSTRAINT "fantasy_point_breakdown_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_point_breakdown" ADD CONSTRAINT "fantasy_point_breakdown_match_id_player_id_fkey" FOREIGN KEY ("match_id", "player_id") REFERENCES "match_player_stats"("match_id", "player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_point_breakdown" ADD CONSTRAINT "fantasy_point_breakdown_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "fantasy_rulesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_point_breakdown" ADD CONSTRAINT "fantasy_point_breakdown_match_id_player_id_ruleset_id_fkey" FOREIGN KEY ("match_id", "player_id", "ruleset_id") REFERENCES "fantasy_points"("match_id", "player_id", "ruleset_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachetePlayerMatchStat" ADD CONSTRAINT "MachetePlayerMatchStat_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "MacheteFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachetePlayerMatchStat" ADD CONSTRAINT "MachetePlayerMatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "MachetePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachetePlayerSnapshot" ADD CONSTRAINT "MachetePlayerSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "MachetePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteSyncJob" ADD CONSTRAINT "MacheteSyncJob_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "MacheteLeague"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacheteSyncJob" ADD CONSTRAINT "MacheteSyncJob_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "MacheteTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamStatsImport" ADD CONSTRAINT "BaltikaTeamStatsImport_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamStatsImport" ADD CONSTRAINT "BaltikaTeamStatsImport_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamStatsImport" ADD CONSTRAINT "BaltikaTeamStatsImport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamStatsImport" ADD CONSTRAINT "BaltikaTeamStatsImport_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaFixture" ADD CONSTRAINT "BaltikaFixture_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaFixture" ADD CONSTRAINT "BaltikaFixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaFixture" ADD CONSTRAINT "BaltikaFixture_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BaltikaTeamStatsImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaFixture" ADD CONSTRAINT "BaltikaFixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaFixture" ADD CONSTRAINT "BaltikaFixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamMatchStat" ADD CONSTRAINT "BaltikaTeamMatchStat_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "BaltikaFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamMatchStat" ADD CONSTRAINT "BaltikaTeamMatchStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaltikaTeamMatchStat" ADD CONSTRAINT "BaltikaTeamMatchStat_opponentTeamId_fkey" FOREIGN KEY ("opponentTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

