-- Provider player IDs are the authoritative identity when they exist. Two real
-- Sports.ru players can share the same normalized name and club, so the legacy
-- name/team key must not collapse those rows. Keep a partial uniqueness guard
-- for workbook/HTML rows that genuinely have no provider player ID.

DROP INDEX "fantasy_player_prices_contest_normalized_name_team_name_key";

CREATE INDEX "fantasy_player_prices_contest_normalized_name_team_name_idx"
ON "fantasy_player_prices"("contest_id", "normalized_name", "team_name");

CREATE UNIQUE INDEX "fantasy_player_prices_contest_legacy_name_team_name_key"
ON "fantasy_player_prices"("contest_id", "normalized_name", "team_name")
WHERE "provider_player_id" IS NULL;
