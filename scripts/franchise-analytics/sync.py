"""Batch collector, no AI.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import os,sys,subprocess,time,json,pathlib
from contextlib import contextmanager
from research import ROOT,CACHE,franchises,metadata,players,squads,server

@contextmanager
def collection_lock(root):
    legacy = root / '.collection.lock'
    if sys.platform == 'linux':
        import fcntl
        if legacy.exists():
            raise SystemExit('Legacy .collection.lock requires owner verification.')
        with (root / '.collection.flock').open('a') as guard:
            try:
                fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise SystemExit('Another collection is active.')
            # A stage can outlive its parent on interruption.
            yield (guard.fileno(),)
        return

    try:
        handle = legacy.open('x')
    except FileExistsError:
        raise SystemExit('Another collection is active; verify its process before removing the lock.')
    try:
        with handle:
            handle.write(str(os.getpid()))
        yield ()
    finally:
        legacy.unlink(missing_ok=True)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with collection_lock(ROOT) as descriptors:
        for name in ['acquire', 'features', 'aggregate', 'enrich', 'hypotheses', 'export']:
            result = subprocess.run([sys.executable, __file__, '--stage', name], pass_fds=descriptors)
            if result.returncode:
                raise SystemExit(result.returncode)
        # Preserve sources and discard reproducible intermediates after success.
        for name in ['features.pkl', 'squad-metrics.pkl', 'decisions.pkl', 'purchases.pkl']:
            (ROOT / 'source' / name).unlink(missing_ok=True)
        (ROOT / 'decisions.json').unlink(missing_ok=True)
        for path in CACHE.glob('*.json.gz'):
            if time.time() - path.stat().st_mtime > 30 * 86400:
                path.unlink()


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
