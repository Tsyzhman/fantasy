"""Compact read-only progress. @spec spec://common/INFRA-006-continuous-deployment#heavy-jobs"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
resource_path = Path(__file__).with_name("resources-resume.jsonl")
if not resource_path.exists():
    resource_path = Path(__file__).with_name("resources-during.jsonl")
rows = [json.loads(line) for line in resource_path.read_text().splitlines() if line.startswith("{")]
last = rows[-1]
phase = re.search(r"--stage ([a-z-]+)", last["processes"])
print(json.dumps({"utc": last["utc"], "memory_mib": round(last["memory_bytes"] / 1048576), "observed_peak_mib": round(max(row["memory_bytes"] for row in rows) / 1048576), "oom_kill": last["events"]["oom_kill"], "service": last["service"], "phase": phase[1] if phase else "import-or-idle"}))
script = b"""import subprocess,json
p=subprocess.run(['journalctl','-u','fantasy-franchises.service','--since','2026-10-21 11:08:00','--no-pager','-q'],capture_output=True,text=True,timeout=15)
print(json.dumps([line[:180] + ' ... ' + line[-300:] if len(line) > 600 else line for line in p.stdout.splitlines()[-3:]]))
"""
if resource_path.name == "resources-resume.jsonl":
    script = script.replace(b"2026-10-21 11:08:00", b"2026-10-21 12:14:00")
p = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "deploy", "python3 -"], input=script, capture_output=True, timeout=25)
print(p.stdout.decode("utf-8", "replace"))
if p.returncode:
    print(p.stderr.decode("utf-8", "replace")[:500])
