UPDATE "foontasy_forecasts"
SET "source_round_label" = "round_number"::TEXT
WHERE "source_round_label" = '';

UPDATE "foontasy_forecasts"
SET "source_round_number" = "round_number"
WHERE "source_round_number" = 0;

UPDATE "foontasy_forecast_samples"
SET "source_round_label" = "round_number"::TEXT
WHERE "source_round_label" = '';

UPDATE "foontasy_forecast_samples"
SET "source_round_number" = "round_number"
WHERE "source_round_number" = 0;

UPDATE "foontasy_forecasts" AS forecast
SET "source_season_id" = contest."rules"->>'sportsRuSeasonId'
FROM "sports_ru_fantasy_contests" AS contest
WHERE forecast."source_season_id" = 'legacy'
  AND contest."provider" = 'SPORTS_RU'
  AND contest."league_id" = forecast."league_id"
  AND contest."season" = forecast."season"
  AND NULLIF(contest."rules"->>'sportsRuSeasonId', '') IS NOT NULL;

UPDATE "foontasy_forecast_samples" AS sample
SET "source_season_id" = contest."rules"->>'sportsRuSeasonId'
FROM "sports_ru_fantasy_contests" AS contest
WHERE sample."source_season_id" = 'legacy'
  AND contest."provider" = 'SPORTS_RU'
  AND contest."league_id" = sample."league_id"
  AND contest."season" = sample."season"
  AND NULLIF(contest."rules"->>'sportsRuSeasonId', '') IS NOT NULL;

CREATE UNIQUE INDEX "foontasy_forecasts_source_round_player_key"
ON "foontasy_forecasts"("league_id", "season", "source_variant", "source_season_id", "source_round_number", "source_player_id");

CREATE UNIQUE INDEX "foontasy_forecast_samples_source_round_player_key"
ON "foontasy_forecast_samples"("league_id", "season", "source_variant", "source_season_id", "source_round_number", "source_player_id");
