# @spec spec://common/INFRA-006-continuous-deployment#observability
"""Post-success read-only acceptance against exact running image and source."""
import datetime, json, pathlib, shlex, subprocess
root=pathlib.Path(__file__).resolve().parents[4]
e=root/'specs/work/evidence/WI-088'
ssh=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy']
def remote(args,source=None,timeout=120):
 p=subprocess.run(ssh+[shlex.join(args)],input=source,capture_output=True,text=True,encoding='utf-8',timeout=timeout)
 if p.returncode: raise RuntimeError(p.stderr[-4000:])
 return p.stdout
def save(name,value):
 (e/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
exit=json.loads((e/'production-sync-0152-exit.json').read_text(encoding='utf-8'))
assert exit['exitCode']==0
start=exit['startedAt']
cutoff=exit.get('resumeAfter') or start
image=remote(['docker','inspect','fantasy-scout-worker','--format','{{.Image}}']).strip()
def isolated(name,mb,script,*args):
 return json.loads(remote(['docker','run','--rm','-i','--name',name,'--read-only','--network','none','--memory',str(mb)+'m','--memory-swap',str(mb)+'m','--cpus','1','--pids-limit','64','-v','fantasy-scout-franchises:/app/storage/franchises:ro','--entrypoint','python3',image,'-B','-',*args],script))
audit=(root/'specs/work/evidence/WI-079/audit-franchise-sources.py').read_text(encoding='utf-8').replace('2026-10-21T08:08:16Z',cutoff)
a=isolated('fantasy-audit-sources-0152',512,audit)
save('source-audit-after-0152.json',a)
assert a['duplicate_index_names']==a['duplicate_rounds']==0
for key in ('duplicate_squad_keys','duplicate_active_players','empty_immutable_lineups','stale_mutable_sources'): assert a['counts'].get(key,0)==0,(key,a['counts'])
assert not a['intermediates_remaining'] and not a['collection_markers']
assert a['cache']['older_than_30_days']==a['cache']['temporary_files']==0
v=isolated('fantasy-audit-snapshot-0152',1536,(e/'verify-fresh-output.py').read_text(encoding='utf-8'),cutoff)
save('fresh-output-0152.json',v)
q="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT json_agg(t) FROM (SELECT season,version,generated_at,squads,octet_length(payload) AS bytes,sha256 FROM franchise_analytics_snapshots) t; ROLLBACK;"
raw=remote(['docker','exec','fantasy-scout-postgres','psql','-X','-U','fantasy_app','-d','fantasy_scout','-At','-c',q])
db=json.loads(next(x for x in raw.splitlines() if x.startswith('[')))
assert len(db)==1 and db[0]['sha256']==v['sha256']!= 'a59ecee27820d092cf769c8ebd07fc5a71b2486b234715926210730552e096ab'
assert db[0]['squads']==v['observations'] and db[0]['version']==2
save('published-database-0152.json',db)
reader=(root/'specs/work/evidence/WI-079/read-published.cjs').read_text(encoding='utf-8').replace('2026-10-21','2027-06-30')
r=json.loads(remote(['docker','exec','-i','fantasy-scout-worker','node','--max-old-space-size=768','-'],reader))
save('published-reader-after-0152.json',r)
assert r['franchises']==75 and r['managerSquads']==v['observations']
assert r['revision']==v['sha256']+':0'
assert r['squads']==v['eligibleFranchiseObservations']
assert datetime.datetime.fromisoformat(r['generated'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(start)
print(json.dumps({'freshOutput':{k:v[k] for k in ('generated','sha256','groups','indexedSources','observations','uniqueObservations','roleUnionsChecked','freezeEvents','freezeBasis')},'sourceCounts':a['counts'],'cache':a['cache'],'reader':r},ensure_ascii=False))
