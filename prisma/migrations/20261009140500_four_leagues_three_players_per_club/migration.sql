-- @spec spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits
-- Correct only the affected current-season Sports.ru contests. Keep historical
-- seasons, other providers and explicit non-default operator limits intact.
UPDATE sports_ru_fantasy_contests
SET max_players_per_team = 3,
    updated_at = CURRENT_TIMESTAMP
WHERE provider = 'SPORTS_RU'
  AND league_id IN (48, 57, 61, 71)
  AND season = '2026/2027'
  AND max_players_per_team = 2;
