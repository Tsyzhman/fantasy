-- Correct the current Sports.ru UCL contest; preserve historical seasons.
UPDATE sports_ru_fantasy_contests
SET max_players_per_team = 3
WHERE provider = 'SPORTS_RU'
  AND league_id = 42
  AND season = '2026/2027'
  AND max_players_per_team = 2;
