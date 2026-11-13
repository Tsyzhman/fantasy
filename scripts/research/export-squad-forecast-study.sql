-- @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
-- psql -XqAt -v ON_ERROR_STOP=1 -v season=2026/2027 -v cutoff=2026-11-13T13:00:00Z -f this-file
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '60s';

WITH eligible AS (
  SELECT s.*, r.id AS round_id, r.ordinal, r.deadline_at, r.finished_at,
    c.rules->>'sportsRuSeasonId' AS source_season
  FROM squad_planning_snapshots s
  JOIN sports_ru_fantasy_contests c ON c.id = s.contest_id AND c.provider = 'SPORTS_RU'
  JOIN fantasy_provider_rounds r ON r.contest_id = s.contest_id
    AND s.round_key = 'sports-ru:tour:' || r.ordinal || ':' || r.provider_round_id
  WHERE s.provider = 'SPORTS_RU' AND s.season = :'season' AND s.status = 'READY'
    AND r.status = 'FINISHED' AND s.captured_at < least(r.deadline_at, s.first_kickoff_at)
    AND r.deadline_at IS NOT NULL AND r.deadline_at < :'cutoff'::timestamptz
    AND jsonb_typeof(s.players) = 'array' AND c.rules->>'sportsRuSeasonId' IS NOT NULL
)
SELECT jsonb_build_object('kind','round','contest', e.contest_id,'league',e.league_id::text,
  'season',e.source_season,'round',e.ordinal,'key',e.round_key,'deadline',e.deadline_at,
  'captured',e.captured_at,'finished',e.finished_at,'firstKickoff',e.first_kickoff_at,
  'snapshotHash',e.payload_hash,'fixtures', f.fixtures,'players', p.players)
FROM eligible e
CROSS JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_array(f.provider_fixture_id, f.home_team_id::text, f.away_team_id::text,
      f.kickoff_at, f.status, f.mapping_status, m.finished, m.id::text,
      f.provider_home_team_id, f.provider_away_team_id)
    ORDER BY f.kickoff_at, f.provider_fixture_id) AS fixtures
  FROM fantasy_provider_fixtures f LEFT JOIN matches m ON m.id=f.match_id
  WHERE f.round_id = e.round_id
) f
CROSS JOIN LATERAL (
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'playerId', x->>'playerId','providerPlayerId',x->>'providerPlayerId','teamId',x->>'teamId',
    'positionGroup',x->'positionGroup','expectedMinutes',x->'expectedMinutes','startProbability',x->'startProbability',
    'isStarter',x->'isStarter','roundPoints',x->'roundPoints'->0,'predictedFp',x->'predictedFp',
    'alternativeRoundPoints',x->'alternativeRoundPoints'->0,'alternativePredictedFp',x->'alternativePredictedFp',
    'opp',x->'opponentAdjustedRoundPoints'->0,'altOpp',x->'alternativeOpponentAdjustedRoundPoints'->0,
    'fixtureCount',x->'roundFixtureCounts'->0,'recentFp',x->'recentFp', 'calculated',x->'forecastCalculatedAt','dataUpdated',x->'forecastDataUpdatedAt',
    'price',x->'price','age',x->'age','confidence',x->'forecastConfidence',
    'component',x->'projectionListMetrics','stats',x->'historicalStats'
  )) ORDER BY x->>'playerId') AS players
  FROM jsonb_array_elements(e.players) x
) p
ORDER BY e.deadline_at,e.league_id,e.ordinal;

SELECT jsonb_build_object('kind','identity','contest', c.id, 'rows',
  jsonb_agg(DISTINCT jsonb_build_array(p.provider_player_id,p.provider_stat_player_id,p.player_id::text)))
FROM sports_ru_fantasy_contests c JOIN fantasy_player_prices p ON p.contest_id=c.id
WHERE c.provider='SPORTS_RU' AND c.season=:'season' AND p.provider_stat_player_id IS NOT NULL
GROUP BY c.id ORDER BY c.id;
ROLLBACK;
