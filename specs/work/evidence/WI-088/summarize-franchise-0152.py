# @spec spec://common/INFRA-006-continuous-deployment#observability
import json,pathlib
root=pathlib.Path(__file__).resolve().parents[4]
e=root/'specs/work/evidence/WI-088'
read=lambda n:json.loads((e/n).read_text(encoding='utf-8-sig'))
ex=read('production-sync-0152-exit.json')
lines=[json.loads(x) for x in (e/'production-monitor-0152-live.jsonl').read_text(encoding='utf-8').splitlines()]
samples=[x for x in lines if 'memory_bytes' in x]
stages=[json.loads(x.split('FRANCHISE_STAGE ',1)[1]) for x in (e/'production-sync-0152.log').read_text(encoding='utf-8').splitlines() if 'FRANCHISE_STAGE ' in x]
assert ex['exitCode']==0 and samples and any(x.get('finished') for x in lines)
assert stages and all(x['succeeded'] for x in stages)
assert not any(x.get('abort_required') or x.get('startup_timeout') or x.get('deadline_reached') for x in lines)
r={'commit':'3e58a9f3d7d45fc9f26b815f9b9c33a80e2d4b65','outcome':'full source acquisition, calculation and atomic publication succeeded','exit':ex,'stages':stages,'memorySamples':len(samples),'sampledPeakBytes':max(x['memory_bytes'] for x in samples),'minAvailableBytes':min(x['available_bytes'] for x in lines if 'available_bytes' in x),'abortRequired':False,'kernelPeakAvailable':any(x.get('peak_bytes') is not None for x in samples),'protectedStateChanged':False}
for k,out in [('oom','oomEvents'),('oom_kill','oomKillEvents'),('max','maxEvents')]:
 r[out]=max(x['events'].get(k,0) for x in samples)
 if k in ('oom','oom_kill'): assert r[out]==0
r['memoryPressureObserved']=r['maxEvents']>0
r['containerSpareCapacityProven']=False
r['memoryPressureNote']='memory.events.max records boundary-triggered reclaim attempts, separately from OOM. Preserve this pressure evidence; optimize export before claiming growth headroom. Runtime limits and abort guards are unchanged.'
assert r['minAvailableBytes']>=1024**3
(e/'production-run-0152-summary.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8')
print(json.dumps(r))
