"""Read-only production audit; emit aggregates and explicitly safe configuration only."""
import datetime
import json
import os
import pathlib
import subprocess
import sys


def run(args, timeout=30):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return {"code": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip()[:1500]}
    except Exception as exc:
        return {"error": type(exc).__name__}


def sql(query):
    return run(["docker", "exec", "fantasy-scout-postgres", "psql", "-X", "-U", "fantasy_app", "-d", "fantasy_scout", "-At", "-c", "BEGIN READ ONLY; SET LOCAL statement_timeout='12s'; " + query + "; ROLLBACK"], 20)


result = {"captured_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
result["memory"] = run(["free", "-m"])
result["disk"] = run(["df", "-h", "/"])
result["cpu"] = run(["nproc"])
result["uptime"] = run(["uptime"])
result["current_release"] = os.path.realpath("/var/www/fantasy-scout-current")
names = run(["docker", "ps", "-a", "--filter", "name=fantasy-scout", "--format", "{{.Names}}"])["stdout"].splitlines()
containers = json.loads(run(["docker", "container", "inspect", *names])["stdout"])
safe_keys = {"NODE_OPTIONS", "INGESTION_WORKER_IN_PROCESS", "FPL_ENABLED", "FPL_PRICE_SYNC_ENABLED", "PROBABLE_LINEUP_SYNC_ENABLED", "APP_RELEASE_VERSION", "APP_RELEASE_COMMIT", "FANTASY_MODEL_FORECAST_ISOLATED", "FANTASY_PLAYER_POOL_SNAPSHOT_ENABLED", "WEB_SCHEDULER_ACTIVATION_FILE", "UV_THREADPOOL_SIZE", "MALLOC_ARENA_MAX"}
result["containers"] = []
for c in containers:
    h = c["HostConfig"]
    env = dict(s.split("=", 1) for s in c["Config"].get("Env", []) if "=" in s)
    result["containers"].append({
        "name": c["Name"], "image": c["Config"]["Image"], "image_id": c["Image"],
        "state": {k: c["State"].get(k) for k in ["Status", "OOMKilled", "StartedAt", "FinishedAt"]},
        "health": c["State"].get("Health", {}).get("Status"), "restarts": c["RestartCount"],
        "user": c["Config"].get("User"),
        "resources": {k: h.get(k) for k in ["Memory", "MemoryReservation", "MemorySwap", "NanoCpus", "CpuShares", "PidsLimit", "ReadonlyRootfs", "Privileged", "CapDrop", "SecurityOpt", "LogConfig"]},
        "safe_env": {k: v for k, v in env.items() if k in safe_keys},
        "database_pool_options": env.get("DATABASE_URL", "").split("?", 1)[1] if "?" in env.get("DATABASE_URL", "") else None,
        "mounts": [{k: m.get(k) for k in ["Type", "Name", "Source", "Destination", "RW"]} for m in c.get("Mounts", [])],
        "healthcheck": c["Config"].get("Healthcheck"),
    })
result["runtime_versions"] = run(["docker", "exec", "fantasy-scout-web", "node", "-e", "console.log(JSON.stringify({node:process.version,next:require('next/package.json').version,react:require('react/package.json').version,prisma:require('@prisma/client/package.json').version}))"])
result["stats"] = run(["docker", "stats", "--no-stream", "--format", "{{json .}}", "fantasy-scout-web", "fantasy-scout-worker", "fantasy-scout-postgres", "fantasy-scout-fpl-relay"])
result["docker_disk"] = run(["docker", "system", "df"])
result["timers"] = run(["systemctl", "list-timers", "--all", "--no-pager", "--plain", "fantasy*", "*backup*"])
result["backup_files"] = run(["find", "/var/backups/fantasy-scout", "-maxdepth", "1", "-type", "f", "-printf", "%TY-%Tm-%Td %TH:%TM %s %f\n"])
result["directory_sizes"] = run(["du", "-sh", "/var/backups/fantasy-scout", "/var/www/fantasy-scout-releases", "/var/www/fantasy-scout"], 60)
result["database_settings"] = sql("SELECT json_agg(t) FROM (SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','log_min_duration_statement','shared_preload_libraries','archive_mode','archive_timeout','wal_level','max_wal_size','checkpoint_timeout')) t")
result["database_size"] = sql("SELECT pg_database_size(current_database())")
result["database_connections"] = sql("SELECT json_agg(t) FROM (SELECT state,count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state) t")
result["database_tables"] = sql("SELECT json_agg(t) FROM (SELECT relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,last_autovacuum,last_autoanalyze,pg_total_relation_size(relid) AS bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25) t")
result["database_extensions"] = sql("SELECT json_agg(extname) FROM pg_extension")
result["database_stats"] = sql("SELECT json_agg(t) FROM (SELECT stats_reset,xact_commit,xact_rollback,deadlocks,temp_files,temp_bytes,blks_read,blks_hit FROM pg_stat_database WHERE datname=current_database()) t")
result["health"] = run(["curl", "-fsS", "--max-time", "10", "https://fantasy.tsyzhman.ru/api/health"])
print(json.dumps(result, indent=2))
