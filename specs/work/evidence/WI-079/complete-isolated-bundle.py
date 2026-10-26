"""Finish the verified acquisition in a separate bounded CLI container, then import atomically."""
import base64,hashlib,pathlib,subprocess,sys
sys.stdout.reconfigure(encoding='utf-8')
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert commit=='703edd62f45e514bbff003221b9fe7d7cd8ee7d0'
assert not subprocess.check_output(['git','diff','f722a05',commit,'--','scripts/franchise-analytics/analyze.py','scripts/franchise-analytics/forecast_sources.py'])
archive=subprocess.check_output(['git','archive','--format=tar',commit,'scripts/franchise-analytics','ops/franchises-job.py'])
runner=r'''
import datetime,json,os,pathlib,resource,shutil,subprocess,sys
canonical=pathlib.Path('/app/storage/franchises');target=canonical/'.wi079-f722a05'
assert target.is_dir() and (target/'source/features.pkl').stat().st_size>100000
assert json.loads((target/'source-audit.json').read_text())['features']==62651
environment=os.environ.copy();environment['FRANCHISE_DATA_DIR']=str(target)
environment.pop('FRANCHISE_RESUME_AFTER',None);environment.pop('FRANCHISE_USE_CACHE',None)
status=canonical/'.wi079-operation.json'
def state(phase,**extra):
 data={'commit':'703edd62f45e514bbff003221b9fe7d7cd8ee7d0','phase':phase,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'max_child_rss_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'memory_events':pathlib.Path('/sys/fs/cgroup/memory.events').read_text(),**extra}
 status.write_text(json.dumps(data));print('ISOLATED_BUNDLE',json.dumps(data),flush=True)
try:
 for stage in ['aggregate','enrich','hypotheses','export']:
  state(stage)
  subprocess.run([sys.executable,'/opt/wi079-candidate/scripts/franchise-analytics/sync.py','--stage',stage],env=environment,check=True,timeout=600)
 state('import')
 subprocess.run(['node','scripts/franchises.cjs'],cwd='/app',env=environment,check=True,timeout=600)
 for name in ['snapshot.json.gz','report-data.json','validation.json','source-audit.json']:
  temporary=canonical/(name+'.wi079.tmp');shutil.copyfile(target/name,temporary);os.replace(temporary,canonical/name)
 for directory in [target/'source',canonical/'source']:
  for name in ['features.pkl','squad-metrics.pkl','decisions.pkl','purchases.pkl']:(directory/name).unlink(missing_ok=True)
 for directory in [target,canonical]:(directory/'decisions.json').unlink(missing_ok=True)
 state('complete',bundle=str(target))
except BaseException as error:
 state('failed',error=str(error)[:500]);raise
'''
host=r'''
import base64,fcntl,hashlib,importlib.util,io,pathlib,tarfile,tempfile
archive=base64.b64decode(ARCHIVE_DATA);assert hashlib.sha256(archive).hexdigest()==ARCHIVE_SHA
with pathlib.Path('/home/deploy/.cache/fantasy-franchises.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 with tempfile.TemporaryDirectory(prefix='wi079-isolated-source-') as directory:
  with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
   for member in bundle.getmembers():
    path=pathlib.PurePosixPath(member.name);assert not path.is_absolute() and '..' not in path.parts and not member.issym() and not member.islnk()
   bundle.extractall(directory)
  spec=importlib.util.spec_from_file_location('franchises_job',pathlib.Path(directory)/'ops/franchises-job.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
  code=RUNNER_CODE
  raise SystemExit(job.run_job(command=['/opt/franchises/bin/python','-'],mounts=[f'type=bind,src={directory},dst=/opt/wi079-candidate,readonly'],input_bytes=code.encode()))
'''.replace('ARCHIVE_DATA',repr(base64.b64encode(archive).decode())).replace('ARCHIVE_SHA',repr(hashlib.sha256(archive).hexdigest())).replace('RUNNER_CODE',repr(runner))
with pathlib.Path('specs/work/evidence/WI-079/isolated-bundle.log').open('wb') as log:
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ServerAliveInterval=15','deploy','python3 -'],input=host.encode(),stdout=log,stderr=subprocess.STDOUT,timeout=5570)
print('\n'.join(x[:500] for x in pathlib.Path('specs/work/evidence/WI-079/isolated-bundle.log').read_text('utf-8',errors='replace').splitlines()[-15:]));raise SystemExit(result.returncode)
