"""Calculate the completed acquisition with committed code; publish via the supported bundle importer."""
import base64
import hashlib
import pathlib
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert commit=='f722a052cc4c65cfcf1da4b93cd77117854fb692'
archive=subprocess.check_output(['git','archive','--format=tar',commit,'scripts/franchise-analytics'])
runner=r'''
import datetime,json,os,pathlib,shutil,subprocess,sys
canonical=pathlib.Path('/app/storage/franchises')
target=canonical/'.wi079-f722a05'
if target.exists() or target.is_symlink():raise SystemExit('Candidate bundle already exists')
target.mkdir();(target/'source').mkdir()
for entry in (canonical/'source').iterdir():
 if entry.name in ['http','squads'] or entry.name.endswith(('.json','.jsonl.gz','.complete')):
  (target/'source'/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
for name in ['leagues.json','franchise-teams.json','franchises.json','players-coverage.json','squad-index.json','freezes.json']:
 shutil.copyfile(canonical/name,target/name)
environment=os.environ.copy();environment['FRANCHISE_DATA_DIR']=str(target)
environment.pop('FRANCHISE_RESUME_AFTER',None);environment.pop('FRANCHISE_USE_CACHE',None)
environment['NODE_OPTIONS']='--max-old-space-size=768'
status=canonical/'.wi079-operation.json'
def state(phase,**extra):
 data={'commit':'f722a052cc4c65cfcf1da4b93cd77117854fb692','phase':phase,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),**extra}
 status.write_text(json.dumps(data));print('OPERATOR_BUNDLE',json.dumps(data),flush=True)
try:
 for stage in ['features','aggregate','enrich','hypotheses','export']:
  state(stage)
  subprocess.run([sys.executable,'/tmp/wi079-f722a05/scripts/franchise-analytics/sync.py','--stage',stage],env=environment,check=True,timeout=600)
 state('import')
 subprocess.run(['node','scripts/franchises.cjs'],cwd='/app',env=environment,check=True,timeout=600)
 for name in ['snapshot.json.gz','report-data.json','validation.json','source-audit.json']:
  temporary=canonical/(name+'.wi079.tmp');shutil.copyfile(target/name,temporary);os.replace(temporary,canonical/name)
 for directory in [target/'source',canonical/'source']:
  for name in ['features.pkl','squad-metrics.pkl','decisions.pkl','purchases.pkl']:(directory/name).unlink(missing_ok=True)
 (canonical/'decisions.json').unlink(missing_ok=True)
 state('complete',bundle=str(target))
except BaseException as error:
 state('failed',error=str(error)[:500]);raise
'''
host=r'''
import base64,fcntl,hashlib,io,json,pathlib,subprocess,tarfile,tempfile
archive=base64.b64decode(ARCHIVE_BYTES)
assert hashlib.sha256(archive).hexdigest()==ARCHIVE_SHA
with pathlib.Path('/home/deploy/.cache/fantasy-franchises.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 container=json.loads(subprocess.check_output(['docker','container','inspect','fantasy-scout-worker']))[0]
 env=dict(item.split('=',1) for item in container['Config']['Env'] if '=' in item)
 assert env['APP_RELEASE_COMMIT']=='6da22c0c23a85066f847750a3ecbd69807cbf37f','Worker changed before bundle calculation'
 with tempfile.TemporaryDirectory(prefix='wi079-source-') as directory:
  with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
   for member in bundle.getmembers():
    path=pathlib.PurePosixPath(member.name)
    assert not path.is_absolute() and '..' not in path.parts and not member.issym() and not member.islnk()
   bundle.extractall(directory)
  subprocess.run(['docker','exec','fantasy-scout-worker','mkdir','-p','/tmp/wi079-f722a05'],check=True)
  subprocess.run(['docker','cp',directory+'/.','fantasy-scout-worker:/tmp/wi079-f722a05'],check=True)
  result=subprocess.run(['docker','exec','-i','fantasy-scout-worker','timeout','--signal=TERM','--kill-after=10','1500','flock','--exclusive','--no-fork','/app/storage/franchises/.heavy-job.lock','/opt/franchises/bin/python','-'],input=RUNNER_SOURCE.encode(),timeout=1530)
  raise SystemExit(result.returncode)
'''.replace('ARCHIVE_BYTES',repr(base64.b64encode(archive).decode())).replace('ARCHIVE_SHA',repr(hashlib.sha256(archive).hexdigest())).replace('RUNNER_SOURCE',repr(runner))
with pathlib.Path('specs/work/evidence/WI-079/verified-bundle.log').open('wb') as log:
    result=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ServerAliveInterval=15','deploy','python3 -'],input=host.encode(),stdout=log,stderr=subprocess.STDOUT,timeout=1570)
print(pathlib.Path('specs/work/evidence/WI-079/verified-bundle.log').read_text('utf-8',errors='replace')[-10000:])
raise SystemExit(result.returncode)
