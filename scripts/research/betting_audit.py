"""Read-only production sports audit. No credentials or user data are exported."""
import json, subprocess, pathlib, hashlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.tmp' / 'betting-research-20260907'
OUT.mkdir(parents=True, exist_ok=True)
SSH = ['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','deploy',
       'docker exec -i fantasy-scout-postgres psql -X -q -A -t -v ON_ERROR_STOP=1 -U fantasy_app -d fantasy_scout']

def query(sql):
    statement = "BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SET LOCAL work_mem='8MB'; SELECT coalesce(json_agg(q),'[]'::json) FROM (" + sql + ") q; COMMIT;"
    proc = subprocess.run(SSH,input=statement,encoding='utf-8',capture_output=True,timeout=50)
    if proc.returncode: raise RuntimeError(proc.stderr)
    return json.loads(proc.stdout)

QUERIES = {
 'team_scores': 'SELECT match_id,team_id,goals FROM match_team_stats',
 'tables': "SELECT relname,n_live_tup,pg_total_relation_size(relid) bytes FROM pg_stat_user_tables ORDER BY n_live_tup DESC",
 'matches': "SELECT m.id,m.league_id,l.name league,m.season,m.match_date,m.finished,m.cancelled,m.home_team_id,m.away_team_id,h.name home,a.name away,m.home_score,m.away_score,m.created_at,m.normalized_at,hs.xg hxg,aws.xg axg,hs.shots hshots,aws.shots ashots,hs.shots_on_target hsot,aws.shots_on_target asot,hs.corners hcorners,aws.corners acorners FROM matches m LEFT JOIN leagues l ON l.id=m.league_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id LEFT JOIN match_team_stats hs ON hs.match_id=m.id AND hs.team_id=m.home_team_id LEFT JOIN match_team_stats aws ON aws.match_id=m.id AND aws.team_id=m.away_team_id ORDER BY m.match_date,m.id",
 'odds': 'SELECT * FROM fixture_odds_snapshots ORDER BY match_id',
 'counts': "SELECT 'match_shots' name,count(*) n,count(DISTINCT match_id) matches,count(xg) has_xg FROM match_shots UNION ALL SELECT 'match_events',count(*),count(DISTINCT match_id),NULL FROM match_events UNION ALL SELECT 'match_player_stats',count(*),count(DISTINCT match_id),count(xg) FROM match_player_stats UNION ALL SELECT 'match_team_stats',count(*),count(DISTINCT match_id),count(xg) FROM match_team_stats UNION ALL SELECT 'fantasy_model_forecasts',count(*),NULL,NULL FROM fantasy_model_forecasts",
 'player_coverage': "SELECT m.league_id,m.season,count(*) rows,count(DISTINCT s.match_id) matches,count(s.minutes) minutes,count(s.xg) xg,count(s.shots) shots,count(s.shots_on_target) sot,count(s.tackles_won) tackles,count(s.saves) saves FROM match_player_stats s JOIN matches m ON m.id=s.match_id GROUP BY 1,2 ORDER BY rows DESC",
 'duplicates': "SELECT 'match_natural_key' name,count(*) groups FROM (SELECT league_id,home_team_id,away_team_id,match_date FROM matches GROUP BY 1,2,3,4 HAVING count(*)>1) x UNION ALL SELECT 'odds_match_provider',count(*) FROM (SELECT match_id,provider FROM fixture_odds_snapshots GROUP BY 1,2 HAVING count(*)>1) x UNION ALL SELECT 'shot_fingerprint',count(*) FROM (SELECT match_id,source_fingerprint FROM match_shots GROUP BY 1,2 HAVING count(*)>1) x",
 'db_health': "SELECT pg_database_size(current_database()) db_bytes,(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) connections,(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active') active_connections",
}
if __name__ == '__main__':
    manifest = {'extracted_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':{}}
    for name,sql in QUERIES.items():
        data=query(sql)
        path=OUT/(name+'.json')
        path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        manifest['files'][name]={'rows':len(data),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        print(name, len(data), path.stat().st_size, flush=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
