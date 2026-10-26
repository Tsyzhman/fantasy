"""Read-only incident/resource evidence. @spec spec://common/INFRA-006-continuous-deployment#heavy-jobs"""
import datetime
import json
import subprocess


def run(args, timeout=25):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return {"code": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip()[:1000]}


def sql(query):
    return run(["docker", "exec", "fantasy-scout-postgres", "psql", "-X", "-U", "fantasy_app", "-d", "fantasy_scout", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", "BEGIN READ ONLY; SET LOCAL statement_timeout='12s'; " + query + "; ROLLBACK"])


out = {"captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
out["health"] = run(["curl", "-fsS", "--max-time", "10", "https://fantasy.tsyzhman.ru/api/health"])
out["memory"] = run(["free", "-m"])
out["stats"] = run(["docker", "stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}} {{.CPUPerc}}", "fantasy-scout-worker", "fantasy-scout-web", "fantasy-scout-postgres"])
out["processes"] = run(["docker", "top", "fantasy-scout-worker", "-eo", "pid,ppid,etimes,rss,args"])
out["service"] = run(["systemctl", "show", "fantasy-franchises.service", "-p", "ActiveState", "-p", "SubState", "-p", "Result", "-p", "ExecMainStatus", "-p", "ExecMainStartTimestamp", "-p", "ExecMainExitTimestamp"])
out["timer"] = run(["systemctl", "list-timers", "fantasy-franchises.timer", "--all", "--no-pager"])
out["storage"] = run(["docker", "exec", "fantasy-scout-worker", "sh", "-c", "du -sh storage/franchises/source/http storage/franchises; find storage/franchises/source/http -type f -name '*.json.gz' -mtime +30 | wc -l; ls -l storage/franchises/.sync.lock storage/franchises/.collection.lock 2>/dev/null; cat /sys/fs/cgroup/memory.events"])
out["snapshot"] = sql("SELECT row_to_json(t) FROM (SELECT season,version,generated_at,squads,octet_length(payload) AS compressed_bytes,sha256 FROM franchise_analytics_snapshots) t")
out["duplicates"] = sql("SELECT json_build_object('squads',(SELECT count(*) FROM (SELECT season,slug,round,team FROM franchise_h2h_squads GROUP BY 1,2,3,4 HAVING count(*)>1) t),'rounds',(SELECT count(*) FROM (SELECT season,slug,round FROM franchise_h2h_rounds GROUP BY 1,2,3 HAVING count(*)>1) t),'snapshots',(SELECT count(*) FROM (SELECT season FROM franchise_analytics_snapshots GROUP BY 1 HAVING count(*)>1) t))")
out["containers"] = []
for name in ["fantasy-scout-worker", "fantasy-scout-web"]:
    c = json.loads(run(["docker", "container", "inspect", name])["stdout"])[0]
    out["containers"].append({"name": name, "image": c["Image"], "status": c["State"]["Status"], "health": c["State"].get("Health", {}).get("Status"), "restarts": c["RestartCount"], "oom": c["State"]["OOMKilled"]})
print(json.dumps(out, ensure_ascii=False, indent=2))
