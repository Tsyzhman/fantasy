-- A user can keep multiple named squad variants for the same league season.
DROP INDEX IF EXISTS "user_fantasy_squads_user_id_league_id_season_key";

CREATE UNIQUE INDEX "user_fantasy_squads_user_id_league_id_season_name_key"
  ON "user_fantasy_squads"("user_id", "league_id", "season", "name");

CREATE INDEX "user_fantasy_squads_user_id_league_id_season_updated_at_idx"
  ON "user_fantasy_squads"("user_id", "league_id", "season", "updated_at");
