ALTER TABLE "fantasy_player_prices"
  ADD COLUMN "provider_stat_player_id" TEXT,
  ADD COLUMN "provider_birth_date" DATE;

CREATE INDEX "fantasy_player_prices_provider_birth_date_idx"
  ON "fantasy_player_prices"("league_id", "season", "provider_birth_date");
