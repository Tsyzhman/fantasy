ALTER TABLE "foontasy_forecasts"
ADD COLUMN "source_variant" TEXT NOT NULL DEFAULT 'sports',
ADD COLUMN "source_season_id" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "source_round_label" TEXT NOT NULL DEFAULT '',
ADD COLUMN "source_round_number" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "foontasy_forecast_samples"
ADD COLUMN "source_variant" TEXT NOT NULL DEFAULT 'sports',
ADD COLUMN "source_season_id" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "source_round_label" TEXT NOT NULL DEFAULT '',
ADD COLUMN "source_round_number" INTEGER NOT NULL DEFAULT 0;

UPDATE "foontasy_forecasts"
SET "source_round_label" = "round_number"::TEXT,
    "source_round_number" = "round_number";

UPDATE "foontasy_forecast_samples"
SET "source_round_label" = "round_number"::TEXT,
    "source_round_number" = "round_number";

UPDATE "foontasy_forecasts" AS forecast
SET "source_season_id" = contest."rules"->>'sportsRuSeasonId'
FROM "sports_ru_fantasy_contests" AS contest
WHERE contest."provider" = 'SPORTS_RU'
  AND contest."league_id" = forecast."league_id"
  AND contest."season" = forecast."season"
  AND NULLIF(contest."rules"->>'sportsRuSeasonId', '') IS NOT NULL;

UPDATE "foontasy_forecast_samples" AS sample
SET "source_season_id" = contest."rules"->>'sportsRuSeasonId'
FROM "sports_ru_fantasy_contests" AS contest
WHERE contest."provider" = 'SPORTS_RU'
  AND contest."league_id" = sample."league_id"
  AND contest."season" = sample."season"
  AND NULLIF(contest."rules"->>'sportsRuSeasonId', '') IS NOT NULL;

CREATE INDEX "foontasy_forecasts_scope_player_round_idx"
ON "foontasy_forecasts"("league_id", "season", "source_variant", "player_id", "round_number");

CREATE INDEX "foontasy_forecast_samples_scope_round_idx"
ON "foontasy_forecast_samples"("league_id", "season", "source_variant", "round_number");

CREATE INDEX "foontasy_forecast_samples_scope_player_round_idx"
ON "foontasy_forecast_samples"("league_id", "season", "source_variant", "player_id", "round_number");
