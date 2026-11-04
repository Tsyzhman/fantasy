"""Stream bounded host/cgroup aggregates during the root-authorized real sync.

@spec spec://common/INFRA-006-continuous-deployment#observability

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


def protected_state(container):
    if not container:
        return None
    return {'id': container['Id'], 'restarts': container['RestartCount'],
            'status': container['State']['Status'], 'oom': container['State']['OOMKilled'],
            'started': container['State']['StartedAt']}


if __name__ == '__main__':
    worker = inspect('fantasy-scout-worker')
    if not worker:
        raise SystemExit('Worker missing')
    protected = {name: protected_state(inspect(name)) for name in
                 ('fantasy-scout-web', 'fantasy-scout-worker', 'fantasy-scout-postgres')}
    if any(not state or state['status'] != 'running' or state['oom'] for state in protected.values()):
        raise SystemExit('A protected production container is missing, stopped, or OOM-killed')
    emit({'ready': True, 'worker_image': worker['Image'], 'protected': protected, 'available_bytes': memory_available()})
    deadline = time.monotonic() + 5550
    startup_deadline = time.monotonic() + 180
    found, low_samples, sampled_peak = False, 0, 0
    while time.monotonic() < deadline:
        observed = {name: protected_state(inspect(name)) for name in protected}
        if observed != protected:
            emit({'abort_required': True, 'reason': 'protected production container changed state', 'protected': observed})
            break
        job = inspect('fantasy-scout-franchises-job')
        if not job or job['State']['Status'] != 'running':
            if found:
                emit({'finished': True, 'job_present': job is not None, 'available_bytes': memory_available()})
                break
            if time.monotonic() >= startup_deadline:
                emit({'startup_timeout': True, 'job_seen': False, 'available_bytes': memory_available()})
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
            sampled_peak = max(sampled_peak, current)
            peak_file = cgroup / 'memory.peak'
            peak = int(peak_file.read_text()) if peak_file.exists() else None
            events = {name: int(value) for name, value in (line.split() for line in (cgroup / 'memory.events').read_text().splitlines())}
        except (OSError, ValueError):
            # --rm can remove the cgroup between inspect and the file reads.
            time.sleep(.5)
            continue
        available = memory_available()
        low_samples = low_samples + 1 if available < 1024**3 else 0
        abort = low_samples >= 2 or events.get('oom', 0) > 0 or events.get('oom_kill', 0) > 0
        emit({'memory_bytes': current, 'peak_bytes': peak, 'sampled_peak_bytes': sampled_peak,
              'peak_source': 'kernel' if peak is not None else 'five-second samples; kernel peak unavailable',
              'events': events, 'available_bytes': available, 'abort_required': abort})
        if abort:
            break
        time.sleep(5)
    else:
        emit({'deadline_reached': True, 'job_seen': found})
