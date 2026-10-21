"""Bounded read-only resource sampling while the one-shot collector runs."""
import datetime
import json
import pathlib
import subprocess
import time

container = json.loads(subprocess.check_output(["docker", "container", "inspect", "fantasy-scout-worker"]))[0]
pid = container["State"]["Pid"]
group = pathlib.Path(f"/proc/{pid}/cgroup").read_text().strip().split(":", 2)[-1]
root = pathlib.Path("/sys/fs/cgroup") / group.lstrip("/")
deadline = time.monotonic() + 100 * 60
observed_peak = 0
while time.monotonic() < deadline:
    state = subprocess.check_output(["systemctl", "show", "fantasy-franchises.service", "-p", "ActiveState", "-p", "SubState", "-p", "Result", "-p", "ExecMainStatus"], text=True)
    service = dict(line.split("=", 1) for line in state.splitlines())
    processes = subprocess.check_output(["docker", "top", "fantasy-scout-worker", "-eo", "pid,ppid,etimes,rss,args"], text=True)
    events = dict(line.split() for line in (root / "memory.events").read_text().splitlines())
    memory = int((root / "memory.current").read_text())
    observed_peak = max(observed_peak, memory)
    sample = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "memory_bytes": memory, "observed_peak_bytes": observed_peak, "events": events, "service": service, "processes": processes}
    print(json.dumps(sample), flush=True)
    if service["ActiveState"] not in ["active", "activating", "reloading"]:
        break
    time.sleep(10)
else:
    raise SystemExit("Resource sampler deadline reached")
