"""Batch collector, no AI. @spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
import os,sys,subprocess,time
from research import ROOT,CACHE,franchises,metadata,players,squads,server

def main():
 ROOT.mkdir(parents=True,exist_ok=True);lock=ROOT/'.collection.lock'
 try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
 except FileExistsError:raise SystemExit('Another collection is active; verify its process before removing the lock.')
 os.write(fd,str(os.getpid()).encode());os.close(fd)
 try:
  for name in ['acquire','features','aggregate','enrich','hypotheses','export']:
   result=subprocess.run([sys.executable,__file__,'--stage',name],env=os.environ.copy())
   if result.returncode:raise SystemExit(result.returncode)
  # Keep source records; discard reproducible large intermediate DataFrames after publication.
  for name in ['features.pkl','squad-metrics.pkl','decisions.pkl','purchases.pkl']:(ROOT/'source'/name).unlink(missing_ok=True)
  (ROOT/'decisions.json').unlink(missing_ok=True)
  for p in CACHE.glob('*.json.gz'):
   if time.time()-p.stat().st_mtime>30*86400:p.unlink()
 finally:lock.unlink(missing_ok=True)

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

if __name__=='__main__':
 if len(sys.argv)==3 and sys.argv[1]=='--stage':stage(sys.argv[2])
 else:main()
