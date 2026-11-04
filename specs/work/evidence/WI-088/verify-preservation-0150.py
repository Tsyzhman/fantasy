"""Read-only post-failure publication and process verification.
@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime
import json
import pathlib
import subprocess

query = "BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT json_agg(t) FROM (SELECT season,version,generated_at,squads,octet_length(payload) AS bytes,sha256 FROM franchise_analytics_snapshots) t; ROLLBACK;"
raw = subprocess.check_output(['docker','exec','fantasy-scout-postgres','psql','-X','-U','fantasy_app','-d','fantasy_scout','-At','-c',query],text=True)
snapshots = json.loads(next(line for line in raw.splitlines() if line.startswith('[')))
assert len(snapshots) == 1 and snapshots[0]['sha256'] == 'a59ecee27820d092cf769c8ebd07fc5a71b2486b234715926210730552e096ab'
jobs = subprocess.check_output(['docker','ps','-a','--filter','name=^/fantasy-scout-franchises-job$','--format','{{.Names}}'],text=True).splitlines()
assert not jobs
temporary = list(pathlib.Path('/tmp').glob('fantasy-franchises-env-*'))
assert not temporary
volume = pathlib.Path(subprocess.check_output(['docker','volume','inspect','fantasy-scout-franchises','--format','{{.Mountpoint}}'],text=True).strip())
markers = {name:(volume/name).exists() for name in ['.sync.lock','.collection.lock','.heavy-job.lock','snapshot.json.gz.tmp']}
assert markers == {'.sync.lock':False,'.collection.lock':False,'.heavy-job.lock':True,'snapshot.json.gz.tmp':False}
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshots':snapshots,'jobs':jobs,'temporary_environment_files':len(temporary),'markers':markers},indent=2))
