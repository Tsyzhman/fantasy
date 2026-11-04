"""Read-only host preflight for the authorized full refresh after deployment.
Run with sudo for source marker metadata; never print the container environment.
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import datetime as dt
import json
import pathlib
import subprocess
import sys

expected = sys.argv[1]
resume = sys.argv[2] if len(sys.argv) == 3 else None
now = dt.datetime.now(dt.timezone.utc)
available = next(int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
assert available >= 4608*1024**2, 'Insufficient host headroom; leave production running'
worker = json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True))[0]
env = dict(value.split('=',1) for value in worker['Config']['Env'] if '=' in value)
assert env['APP_RELEASE_COMMIT'] == expected
assert worker['State']['Status'] == 'running' and worker['State']['Health']['Status'] == 'healthy'
assert not worker['State']['OOMKilled'] and worker['RestartCount'] == 0
overrides = {name:env.get(name) for name in ['FRANCHISE_USE_CACHE','FRANCHISE_RESUME_AFTER','FRANCHISE_DATA_DIR']}
assert not any(overrides.values()), 'Unexpected worker override'
jobs = subprocess.check_output(['docker','ps','-a','--filter','name=^/fantasy-scout-franchises-job$','--format','{{.Names}}'],text=True).splitlines()
assert not jobs
root = pathlib.Path(subprocess.check_output(['docker','volume','inspect','fantasy-scout-franchises','--format','{{.Mountpoint}}'],text=True).strip())
markers = {name:(root/name).exists() for name in ['.sync.lock','.collection.lock','.heavy-job.lock','snapshot.json.gz.tmp']}
assert markers == {'.sync.lock':False,'.collection.lock':False,'.heavy-job.lock':True,'snapshot.json.gz.tmp':False}
intermediates = []
for name in ['source/features.pkl','source/squad-metrics.pkl','source/decisions.pkl','source/purchases.pkl','decisions.json']:
    path = root/name
    if path.exists():
        value = path.stat()
        intermediates.append({'name':name,'bytes':value.st_size,'modified':dt.datetime.fromtimestamp(value.st_mtime,dt.timezone.utc).isoformat()})
resume_age = None
if resume:
    checkpoint = dt.datetime.fromisoformat(resume.replace('Z','+00:00'))
    resume_age = (now-checkpoint).total_seconds()
    assert 0 <= resume_age <= 10800, 'Resume checkpoint expired; use normal acquisition without override'
query = "BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT json_agg(t) FROM (SELECT season,version,generated_at,squads,sha256 FROM franchise_analytics_snapshots) t; ROLLBACK;"
raw = subprocess.check_output(['docker','exec','fantasy-scout-postgres','psql','-X','-U','fantasy_app','-d','fantasy_scout','-At','-c',query],text=True)
snapshots = json.loads(next(line for line in raw.splitlines() if line.startswith('[')))
print(json.dumps({'at':now.isoformat(),'commit':expected,'workerImage':worker['Image'],'availableBytes':available,
                  'workerOverrides':overrides,'resumeAfter':resume,'resumeAgeSeconds':resume_age,'jobNames':jobs,
                  'markers':markers,'existingReproducibleIntermediates':intermediates,'publishedBefore':snapshots,
                  'calculationMode':'All stages must run normally; no USE_CACHE or old output import','ready':True},indent=2))
