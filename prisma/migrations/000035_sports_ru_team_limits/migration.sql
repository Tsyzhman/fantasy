-- Keep the persisted Sports.ru contest limits aligned with the explicit
-- CoreLeague-ID matrix used by sync, spreadsheet imports, and Squad fallback.

UPDATE "sports_ru_fantasy_contests" AS contest
SET
  "max_players_per_team" = configured."max_players_per_team",
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  VALUES
    (42::BIGINT, 2),
    (47::BIGINT, 3),
    (48::BIGINT, 2),
    (53::BIGINT, 3),
    (54::BIGINT, 3),
    (55::BIGINT, 3),
    (57::BIGINT, 2),
    (61::BIGINT, 2),
    (63::BIGINT, 3),
    (71::BIGINT, 2),
    (73::BIGINT, 2),
    (77::BIGINT, 2),
    (87::BIGINT, 3)
) AS configured("league_id", "max_players_per_team")
WHERE contest."provider" = 'SPORTS_RU'
  AND contest."league_id" = configured."league_id"
  AND contest."max_players_per_team" IS DISTINCT FROM configured."max_players_per_team";
