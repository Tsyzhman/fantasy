"""Stream bounded host/cgroup aggregates during the root-authorized real sync.

Run on the Linux host, before starting the regular service. This monitor never
starts or stops a job and never changes production files or configuration.
"""
import datetime
import json
import pathlib
import subprocess
import time


def inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=10)
    return json.loads(result.stdout)[0] if result.returncode == 0 else None


def memory_available():
    return next(int(line.split()[1]) * 1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))


def group(container):
    relative = pathlib.Path(f"/proc/{container['State']['Pid']}/cgroup").read_text().strip().split(':', 2)[-1]
    return pathlib.Path('/sys/fs/cgroup') / relative.lstrip('/')


def emit(value):
    print(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), **value}), flush=True)


if __name__ == '__main__':
    worker = inspect('fantasy-scout-worker')
    if not worker:
        raise SystemExit('Worker missing')
    emit({'ready': True, 'worker_image': worker['Image'], 'worker_restarts': worker['RestartCount'], 'available_bytes': memory_available()})
    deadline = time.monotonic() + 5550
    found, low_samples = False, 0
    while time.monotonic() < deadline:
        job = inspect('fantasy-scout-franchises-job')
        if not job or job['State']['Status'] != 'running':
            if found:
                emit({'finished': True, 'job_present': job is not None, 'available_bytes': memory_available()})
                break
            time.sleep(5)
            continue
        if not found:
            if job['Image'] != worker['Image'] or job['HostConfig']['Memory'] != 3584 * 1024**2 or job['HostConfig']['MemorySwap'] != 3584 * 1024**2:
                emit({'abort_required': True, 'reason': 'image or memory budget differs from reviewed release'})
                break
            found = True
        try:
            cgroup = group(job)
            current = int((cgroup / 'memory.current').read_text())
            peak = int((cgroup / 'memory.peak').read_text())
            events = {name: int(value) for name, value in (line.split() for line in (cgroup / 'memory.events').read_text().splitlines())}
        except (OSError, ValueError):
            # --rm can remove the cgroup between inspect and the file reads.
            time.sleep(.5)
            continue
        available = memory_available()
        low_samples = low_samples + 1 if available < 1024**3 else 0
        abort = low_samples >= 2 or events.get('oom', 0) > 0 or events.get('oom_kill', 0) > 0
        emit({'memory_bytes': current, 'peak_bytes': peak, 'events': events, 'available_bytes': available, 'abort_required': abort})
        if abort:
            break
        time.sleep(5)
    else:
        emit({'deadline_reached': True, 'job_seen': found})
