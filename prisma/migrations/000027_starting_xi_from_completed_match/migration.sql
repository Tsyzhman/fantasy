ALTER TABLE "league_season_teams"
  ADD COLUMN "starting_xi_source_match_id" BIGINT,
  ADD COLUMN "starting_xi_source_match_date" TIMESTAMP(3);

CREATE INDEX "league_season_teams_starting_xi_source_date_idx"
  ON "league_season_teams"("league_id", "season", "starting_xi_source_match_date");
