"""Batch collector, no AI.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import os,sys,subprocess,time,json,pathlib
from research import ROOT,CACHE,franchises,metadata,players,squads,server

def main():
 ROOT.mkdir(parents=True,exist_ok=True);lock=ROOT/'.collection.lock'
 if sys.platform=='linux':
  if lock.exists():raise SystemExit('Legacy .collection.lock requires owner verification.')
  import fcntl
  fd=os.open(ROOT/'.collection.flock',os.O_CREAT|os.O_RDWR,0o600)
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   os.close(fd)
   raise SystemExit('Another collection is active.')
 else:
  try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
  except FileExistsError:raise SystemExit('Another collection is active; verify its process before removing the lock.')
  os.write(fd,str(os.getpid()).encode());os.close(fd)
 try:
  for name in ['acquire','features','aggregate','enrich','hypotheses','export']:
   result=subprocess.run([sys.executable,__file__,'--stage',name],env=os.environ.copy(),pass_fds=(fd,) if sys.platform=="linux" else ())
   if result.returncode:raise SystemExit(result.returncode)
  # Keep source records; discard reproducible large intermediate DataFrames after publication.
  for name in ['features.pkl','squad-metrics.pkl','decisions.pkl','purchases.pkl']:(ROOT/'source'/name).unlink(missing_ok=True)
  (ROOT/'decisions.json').unlink(missing_ok=True)
  for p in CACHE.glob('*.json.gz'):
   if time.time()-p.stat().st_mtime>30*86400:p.unlink()
 finally:
  if sys.platform=="linux":os.close(fd)
  else:lock.unlink(missing_ok=True)

def stage(name):
 if name=='acquire':
  franchises();metadata();players();squads();server()
  import freezes
  freezes.main()
 elif name=='features':
  import analyze
  analyze.features()
 elif name=='aggregate':
  import analyze
  analyze.aggregate()
 elif name=='enrich':
  import enrich
  enrich.main()
 elif name=='hypotheses':
  import research_hypotheses
  research_hypotheses.main()
 elif name=='export':
  import export_snapshot
  export_snapshot.main()
 else:raise ValueError('Unknown stage')

def measured_stage(name):
 """Report exact Linux child peak RSS and cgroup totals without source payloads."""
 started=time.monotonic();succeeded=False
 try:
  stage(name);succeeded=True
 finally:
  metrics={'stage':name,'succeeded':succeeded,'seconds':round(time.monotonic()-started,3)}
  if sys.platform=='linux':
   import resource
   metrics['peak_rss_bytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024
   cgroup=pathlib.Path('/sys/fs/cgroup')
   for filename in ['memory.current','memory.peak','memory.events']:
    try:metrics[filename]=cgroup.joinpath(filename).read_text().strip()
    except OSError:pass
  print('FRANCHISE_STAGE '+json.dumps(metrics),flush=True)

if __name__=='__main__':
 if len(sys.argv)==3 and sys.argv[1]=='--stage':measured_stage(sys.argv[2])
 else:main()
