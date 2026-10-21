#!/usr/bin/env python3
"""One bounded franchise CLI container, sharing the calculation lock and source volume.

@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import json
import os
import pathlib
import subprocess
import tempfile

JOB_NAME = 'fantasy-scout-franchises-job'
SOURCE_ROOT = '/app/storage/franchises'


def configuration(worker, postgres):
    mounts = [m for m in worker['Mounts'] if m['Destination'] == SOURCE_ROOT]
    networks = set(worker['NetworkSettings']['Networks']) & set(postgres['NetworkSettings']['Networks'])
    if len(mounts) != 1 or mounts[0]['Type'] != 'volume' or not mounts[0]['RW'] or len(networks) != 1:
        raise ValueError('Franchise job requires one writable source volume and one database network')
    environment = dict(value.split('=', 1) for value in worker['Config']['Env'] if '=' in value)
    lock = environment.get('FANTASY_HEAVY_JOB_LOCK_PATH', SOURCE_ROOT + '/.heavy-job.lock')
    if pathlib.PurePosixPath(lock).parent != pathlib.PurePosixPath(SOURCE_ROOT):
        raise ValueError('Heavy-job lock must use the shared franchise volume')
    environment['NODE_OPTIONS'] = '--max-old-space-size=768'
    if os.environ.get('FRANCHISE_RESUME_AFTER'):
        environment['FRANCHISE_RESUME_AFTER'] = os.environ['FRANCHISE_RESUME_AFTER']
    else:
        environment.pop('FRANCHISE_RESUME_AFTER', None)
    return {'image': worker['Image'], 'volume': mounts[0]['Name'], 'network': next(iter(networks)), 'environment': environment, 'lock': lock}


def job_command(config, env_file, command=None, mounts=()):
    args = ['docker', 'run', '--rm', '--init', '--name', JOB_NAME,
            '--memory', '5g', '--memory-swap', '5g', '--cpus', '2', '--pids-limit', '128',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--no-healthcheck',
            '--network', config['network'], '--env-file', str(env_file),
            '--mount', f"type=volume,src={config['volume']},dst={SOURCE_ROOT}"]
    for mount in mounts:
        args += ['--mount', mount]
    return args + [config['image'], 'timeout', '--signal=TERM', '--kill-after=15', '5500',
                   'flock', '--exclusive', '--no-fork', config['lock']] + (command or ['node', 'scripts/franchises.cjs', '--sync'])


def run_job(command=None, mounts=(), input_bytes=None):
    available = next(int(line.split()[1]) * 1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
    if available < 6 * 1024**3:
        raise RuntimeError('Franchise job requires 6 GiB available host memory for its 5 GiB cap and host headroom')
    def inspect(name):
        return json.loads(subprocess.check_output(['docker', 'container', 'inspect', name]))[0]
    config = configuration(inspect('fantasy-scout-worker'), inspect('fantasy-scout-postgres'))
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', prefix='fantasy-franchises-env-', delete=False) as target:
            temporary = pathlib.Path(target.name)
            for key, value in config['environment'].items():
                if '\n' in value or '\r' in value:
                    raise ValueError('Multiline container environment is unsupported')
                target.write(key + '=' + value + '\n')
        args = job_command(config, temporary, command, mounts)
        if input_bytes is not None:
            args.insert(2, '-i')
        return subprocess.run(args, input=input_bytes, timeout=5550).returncode
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    raise SystemExit(run_job())
