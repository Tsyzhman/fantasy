CREATE TABLE "fantasy_model_forecasts" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "horizon" INTEGER NOT NULL,
    "points" DOUBLE PRECISION,
    "fixtures_available" INTEGER NOT NULL,
    "fixtures_required" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "input_sources" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fantasy_model_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fantasy_model_forecasts_league_id_season_player_id_horizon_model_version_key"
ON "fantasy_model_forecasts"("league_id", "season", "player_id", "horizon", "model_version");
CREATE INDEX "fantasy_model_forecasts_league_id_season_horizon_calculated_at_idx"
ON "fantasy_model_forecasts"("league_id", "season", "horizon", "calculated_at");
ALTER TABLE "fantasy_model_forecasts" ADD CONSTRAINT "fantasy_model_forecasts_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fantasy_model_forecasts" ADD CONSTRAINT "fantasy_model_forecasts_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
