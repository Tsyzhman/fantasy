"""Read-only aggregates before the controlled fresh production run.

@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import datetime
import json
import pathlib
import subprocess
import sys


def run(args):
    return subprocess.check_output(args, text=True, timeout=20).strip()


expected = sys.argv[1]
worker = json.loads(run(['docker', 'inspect', 'fantasy-scout-worker']))[0]
web = json.loads(run(['docker', 'inspect', 'fantasy-scout-web']))[0]
environment = dict(value.split('=', 1) for value in worker['Config']['Env'] if '=' in value)
available = next(int(line.split()[1]) * 1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
names = run(['docker', 'ps', '--format', '{{.Names}}']).splitlines()
source = run(['docker', 'exec', 'fantasy-scout-worker', '/opt/franchises/bin/python', '-c', "import json,pathlib; root=pathlib.Path('/app/storage/franchises'); print(json.dumps({name:(root/name).exists() for name in ['.sync.lock','.collection.lock','.heavy-job.lock']}))"])
locks = json.loads(source)
snapshot = run(['docker', 'exec', 'fantasy-scout-postgres', 'psql', '-X', '-U', 'fantasy_app', '-d', 'fantasy_scout', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', "BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce(json_agg(t),'[]') FROM (SELECT season,version,generated_at,squads,octet_length(payload) AS bytes,sha256 FROM franchise_analytics_snapshots) t; ROLLBACK;"])
result = {
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'expected': expected,
    'release': str(pathlib.Path('/var/www/fantasy-scout-current').resolve()),
    'worker_commit': environment.get('APP_RELEASE_COMMIT'),
    'worker_image': worker['Image'],
    'web_image': web['Image'],
    'available_bytes': available,
    'worker_count': sum(name == 'fantasy-scout-worker' for name in names),
    'job_names': [name for name in names if name.startswith('fantasy-scout-franchises-job')],
    'overrides': {key: environment.get(key) for key in ['FRANCHISE_USE_CACHE', 'FRANCHISE_RESUME_AFTER', 'FRANCHISE_DATA_DIR']},
    'locks': locks,
    'snapshots': json.loads(snapshot),
}
result['ready'] = (result['worker_commit'] == expected and worker['Image'] == web['Image']
                   and available >= 4608 * 1024**2 and result['worker_count'] == 1
                   and not result['job_names'] and not locks['.sync.lock'] and not locks['.collection.lock']
                   and not environment.get('FRANCHISE_USE_CACHE') and not environment.get('FRANCHISE_RESUME_AFTER')
                   and environment.get('FRANCHISE_DATA_DIR') in (None, '', '/app/storage/franchises', 'storage/franchises'))
print(json.dumps(result, indent=2))
if not result['ready']:
    raise SystemExit(1)
