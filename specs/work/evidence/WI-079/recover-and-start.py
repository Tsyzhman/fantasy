"""Guarded one-off recovery after the verified rollout; never edits application files."""
import fcntl
import json
import subprocess
import urllib.request

expected = "0880d401519052841b7be8d0b217f83f60d46aff"
with urllib.request.urlopen("https://fantasy.tsyzhman.ru/api/health", timeout=10) as response:
    health = json.load(response)
if health["release"]["commit"] != expected:
    raise SystemExit("Expected verified 0.3.141 production before recovery")
container = json.loads(subprocess.check_output(["docker", "container", "inspect", "fantasy-scout-worker"]))[0]
environment = dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)
if environment.get("APP_RELEASE_COMMIT") != expected:
    raise SystemExit("Worker revision differs from the verified web")
lock = open("/home/deploy/.cache/fantasy-franchises.lock", "a")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
try:
    script = r'''
import json,os,pathlib
root=pathlib.Path('/app/storage/franchises')
for entry in pathlib.Path('/proc').iterdir():
    if not entry.name.isdigit():continue
    try:command=(entry/'cmdline').read_bytes().replace(b'\0',b' ').decode('utf-8','replace')
    except (FileNotFoundError,PermissionError):continue
    if 'scripts/franchises.cjs' in command or 'franchise-analytics/' in command:
        raise SystemExit('Collector process still exists; no markers removed')
markers=[]
for name,expected_pid in [('.sync.lock',25789),('.collection.lock',25807)]:
    path=root/name
    if not path.exists():continue
    value=path.read_text().strip()
    if value!=str(expected_pid):raise SystemExit('Marker identity changed; inspect before recovery')
    try:os.kill(expected_pid,0)
    except ProcessLookupError:pass
    else:raise SystemExit('Recorded PID still exists; no markers removed')
    markers.append((path,value))
for path,value in markers:
    if path.read_text().strip()!=value:raise SystemExit('Concurrent marker mutation')
    path.unlink()
print(json.dumps({'removed_stale_markers':[str(path) for path,_ in markers],'recorded_pids_absent':True}))
'''
    result = subprocess.run(["docker", "exec", "-i", "fantasy-scout-worker", "flock", "--exclusive", "--nonblock", "--no-fork", "/app/storage/franchises/.heavy-job.lock", "python3", "-"], input=script, text=True, capture_output=True, timeout=20)
    if result.returncode:
        print(json.dumps({"recovery_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}))
        raise SystemExit(result.returncode)
    print(result.stdout.strip())
finally:
    lock.close()
result = subprocess.run(["sudo", "-n", "systemctl", "start", "--no-block", "fantasy-franchises.service"], capture_output=True, text=True, timeout=15)
print(json.dumps({"start_code": result.returncode, "stderr": result.stderr}))
raise SystemExit(result.returncode)
