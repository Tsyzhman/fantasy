CREATE TABLE "foontasy_forecasts" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "source_player_id" TEXT NOT NULL,
    "player_id" BIGINT,
    "player_name" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "position" TEXT,
    "points" DOUBLE PRECISION NOT NULL,
    "attacking_points" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "selected_by_percent" DOUBLE PRECISION,
    "breakdown" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "foontasy_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foontasy_forecasts_league_id_season_round_number_source_player_id_key"
ON "foontasy_forecasts"("league_id", "season", "round_number", "source_player_id");
CREATE INDEX "foontasy_forecasts_league_id_season_player_id_round_number_idx"
ON "foontasy_forecasts"("league_id", "season", "player_id", "round_number");

ALTER TABLE "foontasy_forecasts" ADD CONSTRAINT "foontasy_forecasts_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "foontasy_forecasts" ADD CONSTRAINT "foontasy_forecasts_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
