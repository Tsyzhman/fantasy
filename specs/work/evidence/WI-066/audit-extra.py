"""Read-only, bounded diagnostics for the audit. No user records or secrets."""
import datetime
import json
import subprocess


def sql(query):
    process = subprocess.run(
        ["docker", "exec", "fantasy-scout-postgres", "psql", "-X", "-U", "fantasy_app", "-d", "fantasy_scout", "-At", "-c",
         "BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; " + query + "; ROLLBACK"],
        capture_output=True, text=True, timeout=15,
    )
    return {"code": process.returncode, "stdout": process.stdout, "stderr": process.stderr}


result = {"captured_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
result["franchise_snapshot_size"] = sql('SELECT json_agg(t) FROM (SELECT season, version, squads, generated_at, octet_length(payload) AS compressed_bytes FROM franchise_analytics_snapshots) t')
result["khl_daily_summary"] = sql("SELECT cursor FROM khl_provider_checkpoints WHERE provider='KHL_DAILY' AND \"jobType\"='ALL_SOURCES' LIMIT 5")
result["fpl_null_scores_with_current_mapping"] = sql("SELECT count(*) FROM fantasy_provider_player_match_scores s WHERE s.provider='FPL' AND s.gameweek=5 AND s.player_id IS NULL AND EXISTS (SELECT 1 FROM fantasy_player_prices p WHERE p.contest_id=s.contest_id AND p.provider_player_id=s.provider_player_id AND p.player_id IS NOT NULL)")
result["franchise_manager_count"] = sql("SELECT count(DISTINCT (franchise, manager)) FROM franchise_h2h_squads WHERE season='2026/2027'")
print(json.dumps(result, ensure_ascii=False, indent=2))
