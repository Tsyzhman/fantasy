CREATE TABLE "player_season_archives" (
    "id" TEXT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "aggregate_scope" TEXT NOT NULL DEFAULT 'LEAGUE',
    "competition_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FOTMOB',
    "provider_player_id" TEXT NOT NULL,
    "provider_team_id" TEXT NOT NULL,
    "provider_league_id" TEXT,
    "appearances" INTEGER,
    "starts" INTEGER,
    "minutes" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "yellow_cards" INTEGER,
    "red_cards" INTEGER,
    "team_matches" INTEGER,
    "source_endpoint" TEXT NOT NULL DEFAULT '/data/playerData',
    "provenance" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_season_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_season_archives_provider_league_season_team_player_scope_key"
ON "player_season_archives"("provider", "league_id", "season", "team_id", "player_id", "aggregate_scope");

CREATE INDEX "player_season_archives_player_id_season_fetched_at_idx"
ON "player_season_archives"("player_id", "season", "fetched_at");

CREATE INDEX "player_season_archives_league_id_season_team_id_idx"
ON "player_season_archives"("league_id", "season", "team_id");

CREATE INDEX "player_season_archives_provider_provider_player_id_season_idx"
ON "player_season_archives"("provider", "provider_player_id", "season");

ALTER TABLE "player_season_archives"
ADD CONSTRAINT "player_season_archives_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_season_archives"
ADD CONSTRAINT "player_season_archives_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_season_archives"
ADD CONSTRAINT "player_season_archives_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_season_archives"
ADD CONSTRAINT "player_season_archives_non_negative_check"
CHECK (
  ("appearances" IS NULL OR "appearances" >= 0) AND
  ("starts" IS NULL OR "starts" >= 0) AND
  ("minutes" IS NULL OR "minutes" >= 0) AND
  ("goals" IS NULL OR "goals" >= 0) AND
  ("assists" IS NULL OR "assists" >= 0) AND
  ("yellow_cards" IS NULL OR "yellow_cards" >= 0) AND
  ("red_cards" IS NULL OR "red_cards" >= 0) AND
  ("team_matches" IS NULL OR "team_matches" >= 0)
);

CREATE TABLE "player_archive_fetch_states" (
    "player_id" BIGINT NOT NULL,
    "provider_player_id" TEXT NOT NULL,
    "last_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "payload_hash" TEXT,
    "archived_rows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_archive_fetch_states_pkey" PRIMARY KEY ("player_id")
);

CREATE UNIQUE INDEX "player_archive_fetch_states_provider_player_id_key"
ON "player_archive_fetch_states"("provider_player_id");

CREATE INDEX "player_archive_fetch_states_last_success_at_last_attempt_at_idx"
ON "player_archive_fetch_states"("last_success_at", "last_attempt_at");

ALTER TABLE "player_archive_fetch_states"
ADD CONSTRAINT "player_archive_fetch_states_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
