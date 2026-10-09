-- @spec spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits
-- Compatible with both serving and candidate binaries; data only, no schema change.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
UPDATE sports_ru_fantasy_contests
SET max_players_per_team = 2, updated_at = CURRENT_TIMESTAMP
WHERE provider = 'SPORTS_RU'
  AND league_id IN (48, 57, 61, 71)
  AND season = '2026/2027'
  AND max_players_per_team = 3;
COMMIT;
