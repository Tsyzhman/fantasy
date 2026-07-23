CREATE TABLE "foontasy_forecast_samples" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "source_player_id" TEXT NOT NULL,
    "player_id" BIGINT,
    "player_name" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "position" TEXT,
    "foontasy_points" DOUBLE PRECISION NOT NULL,
    "attacking_points" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "selected_by_percent" DOUBLE PRECISION,
    "breakdown" TEXT,
    "model_next_points" DOUBLE PRECISION,
    "model_version" TEXT,
    "feature_snapshot" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "foontasy_forecast_samples_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foontasy_forecast_samples_league_id_season_round_number_source_player_id_key"
ON "foontasy_forecast_samples"("league_id", "season", "round_number", "source_player_id");

CREATE INDEX "foontasy_forecast_samples_league_id_season_round_number_idx"
ON "foontasy_forecast_samples"("league_id", "season", "round_number");

CREATE INDEX "foontasy_forecast_samples_league_id_season_player_id_round_number_idx"
ON "foontasy_forecast_samples"("league_id", "season", "player_id", "round_number");

ALTER TABLE "foontasy_forecast_samples" ADD CONSTRAINT "foontasy_forecast_samples_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "foontasy_forecast_samples" ADD CONSTRAINT "foontasy_forecast_samples_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
