"""Start one verified resumed collection and remove its temporary environment override."""
import json
import pathlib
import subprocess
import time
import urllib.request

expected = "bf438b5603411d0da2ccdd88b15b050b10156cd9"
checkpoint = "2026-10-21T08:08:16Z"
with urllib.request.urlopen("https://fantasy.tsyzhman.ru/api/health", timeout=10) as response:
    health = json.load(response)
if health["release"]["commit"] != expected:
    raise SystemExit("Expected verified 0.3.142 before source resume")
if pathlib.Path("/var/www/fantasy-scout-current/.release-commit").read_text().strip() != expected:
    raise SystemExit("Current release manifest differs")
container = json.loads(subprocess.check_output(["docker", "container", "inspect", "fantasy-scout-worker"]))[0]
environment = dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)
if environment.get("APP_RELEASE_COMMIT") != expected:
    raise SystemExit("Worker revision differs")
unit = "fantasy-franchises.service"
state = subprocess.check_output(["systemctl", "show", unit, "-p", "ActiveState", "--value"], text=True).strip()
if state not in ["active", "activating"]:
    subprocess.run(["sudo", "-n", "systemctl", "start", "--no-block", unit], check=True)
for _ in range(20):
    pid = int(subprocess.check_output(["systemctl", "show", unit, "-p", "MainPID", "--value"], text=True).strip())
    if pid:
        break
    time.sleep(0.2)
else:
    raise SystemExit("Resumed service did not acquire a process")
service_environment = pathlib.Path(f"/proc/{pid}/environ").read_bytes().split(bytes([0]))
if ("FRANCHISE_RESUME_AFTER=" + checkpoint).encode() not in service_environment:
    raise SystemExit("Collector did not inherit the verified acquisition checkpoint")
override = pathlib.Path("/run/systemd/system/fantasy-franchises.service.d/wi-079-recovery.conf")
body = "[Service]\nEnvironment=FRANCHISE_RESUME_AFTER=" + checkpoint + "\n"
if override.is_symlink() or override.read_text() != body:
    raise SystemExit("Unexpected temporary override; cleanup refused")
subprocess.run(["sudo", "-n", "rm", "--", str(override)], check=True)
subprocess.run(["sudo", "-n", "systemctl", "daemon-reload"], check=True)
subprocess.run(["sudo", "-n", "systemctl", "enable", "--now", "fantasy-franchises.timer"], check=True)
print(json.dumps({"commit": expected, "main_pid": pid, "resume_after": checkpoint, "temporary_override_removed": not override.exists(), "timer_restored": True}))
