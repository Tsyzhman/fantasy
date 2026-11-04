"""Exact candidate reducer on fresh source states, no aggregate/acquisition/import.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import ast
import hashlib
import json
import pathlib
import subprocess

REPOSITORY = pathlib.Path(__file__).resolve().parents[4]
candidate = (REPOSITORY / 'scripts/franchise-analytics/analyze.py').read_bytes()
tree = ast.parse(candidate.decode('utf-8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'validated_board_states')
reducer = ast.get_source_segment(candidate.decode('utf-8'), function)

CODE = r'''
import copy,hashlib,json,pathlib,random,resource,time
root=pathlib.Path('/app/storage/franchises');path=root/'freezes.json'
raw=path.read_bytes();before_sha=hashlib.sha256(raw).hexdigest()
assert before_sha=='68755f48537764d9e161546b1c6efa2761fb51ebbe2f6313d17490cf3daefe0f','Fresh diagnostic input changed'
freeze=json.loads(raw);before=copy.deepcopy(freeze);namespace={}
exec(REDUCER,namespace);project=namespace['validated_board_states'];started=time.monotonic()
projection=project(freeze['states'])
assert len(freeze['states'])==62669 and len(projection)==61550
assert project(reversed(freeze['states']))==projection
shuffled=list(freeze['states']);random.Random(20261104).shuffle(shuffled)
assert project(shuffled)==projection
assert project(freeze['states']+freeze['states'])==projection
assert freeze==before,'Source records or shared events mutated'
expected=[((401,'championship_2026',10,'590459'),{'active':False,'frozen':True}),((401,'championship_2026',10,'599673'),{'active':False,'frozen':True}),((441,'ucl_2026',2,'632180'),{'active':True,'frozen':True}),((441,'ucl_2026',2,'630929'),{'active':True,'frozen':False})]
for key,value in expected:assert projection[key]==value,(key,projection[key])
assert all(set(value)=={'active','frozen'} for value in projection.values())
index_raw=(root/'squad-index.json').read_bytes();index=json.loads(index_raw)
registry=json.loads((root/'franchises.json').read_text())
assert len(index)==len(set(index))==68368
after_sha=hashlib.sha256(path.read_bytes()).hexdigest();assert before_sha==after_sha
memory=pathlib.Path('/sys/fs/cgroup/memory.current');events=pathlib.Path('/sys/fs/cgroup/memory.events')
print(json.dumps({'states':len(freeze['states']),'projected_unique_xi':len(projection),'state_franchises':len({key[0] for key in projection}),'registry_groups':len(registry),'registry_ids_retained':len({r['id'] for r in registry}),'source_squads':len(index),'unique_source_squads':len(set(index)),'index_sha256':hashlib.sha256(index_raw).hexdigest(),'freeze_events':len(freeze['events']),'freeze_basis':len(freeze['basis']),'same_source_validation':'passed for roles, board, score, opponent score and finished','order_checks':['original','reversed','seeded shuffle','repeated identical records'],'expected_cases':[{'key':key,'flags':value} for key,value in expected],'input_history_deep_equal':freeze==before,'source_before_sha256':before_sha,'source_after_sha256':after_sha,'projection_flags_only':True,'aggregate_run':False,'network_used':False,'source_cache_written':False,'elapsed_seconds':round(time.monotonic()-started,3),'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'cgroup_memory_current_bytes':int(memory.read_text()) if memory.exists() else None,'cgroup_events':events.read_text() if events.exists() else None}),flush=True)
'''.replace('exec(REDUCER,', 'exec(' + repr(reducer) + ',')

REMOTE = r'''
import json,pathlib,subprocess
available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'));assert available>=2*1024**3
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0]
env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v)
assert env.get('APP_RELEASE_COMMIT')=='1c9264f07f6b508a074232811f69b1d9aae87eb4'
assert worker['Image']=='sha256:cf9f730e6747050b6eec4f20ed87fd953f656b804ba2546ea9c1802267d1be1a'
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');assert mount['Type']=='volume'
name='fantasy-scout-franchises-projection-wi088'
args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','none','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",worker['Image'],'timeout','--signal=TERM','--kill-after=5','45','/opt/franchises/bin/python','-']
result=subprocess.run(args,input=CODE,text=True,capture_output=True,timeout=55)
if result.returncode:raise SystemExit(result.stderr[-1500:]+result.stdout[-1500:])
remaining=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,timeout=10).stdout.strip()
available_after=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
print(json.dumps({'configuration':{'available_before_bytes':available,'available_after_bytes':available_after,'image':worker['Image'],'commit':env['APP_RELEASE_COMMIT'],'memory_bytes':1024**3,'memory_swap_bytes':1024**3,'cpus':1,'network':'none','source_readonly':True,'root_readonly':True},'diagnostic':json.loads(result.stdout),'diagnostic_exit':result.returncode,'remaining_container':remaining}))
'''.replace('input=CODE,', 'input=' + repr(CODE) + ',')

if __name__ == '__main__':
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'], input=REMOTE, text=True, encoding='utf-8', capture_output=True, timeout=75)
    if result.returncode:
        raise SystemExit(result.stderr[-2000:] + result.stdout[-2000:])
    data = json.loads(result.stdout)
    data['candidate'] = {'file': 'scripts/franchise-analytics/analyze.py', 'sha256': hashlib.sha256(candidate).hexdigest(), 'reducer_sha256': hashlib.sha256(reducer.encode()).hexdigest(), 'execution': 'exact AST-extracted reducer only; no aggregate/import/module startup'}
    pathlib.Path(__file__).with_name('multiple-duel-projection-rehearsal.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(data, ensure_ascii=True, indent=2))
