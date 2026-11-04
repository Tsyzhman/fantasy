"""Inspect only aggregate calendar/state gaps from the failed local report."""
import json
import pathlib
import subprocess

CODE = r'''
import json,pathlib,collections
root=pathlib.Path('/app/storage/franchises')
report=json.loads((root/'report-data.json').read_text())
freeze=json.loads((root/'freezes.json').read_text())
missing=[r for r in report['squads'] if r.get('active') is None and not r.get('personal_only',False)]
states=freeze['states']
keys=collections.Counter((r['franchise'],r['slug'],r['round'],r['team']) for r in states)
meta=json.loads((root/'leagues.json').read_text())
duplicates=[key for key,count in keys.items() if count>1]
forms=json.loads((root/'franchise-teams.json').read_text())
board_teams={(f['franchise'],f['slug'],str(t['team_id'])) for f in forms if not f.get('personal') for t in f['teams']}
previous=collections.defaultdict(set)
for state in states:previous[(state['franchise'],state['slug'],str(state['team']))].add(state['round'])
categories=collections.Counter();examples=[]
for row in missing:
 key=(row['franchise'],row['slug'],str(row['team']))
 source=json.loads((root/'source/squads'/f"{row['slug']}-{row['team']}-{row['round']}.json").read_text())
 category=(key in board_teams,tuple(sorted(previous.get(key,[]))),type(row['team']).__name__,tuple((m['franchise'],m.get('personal_only')) for m in source.get('memberships',[]) if m['franchise']==row['franchise']))
 categories[str(category)]+=1
 if len(examples)<3:examples.append({'franchise':row['franchise'],'slug':row['slug'],'round':row['round'],'board_team':key in board_teams,'previous_rounds':sorted(previous.get(key,[])),'source_body_round':source['round'],'source_body_team_type':type(source['team']).__name__,'member_flags':[(m['franchise'],m.get('personal_only')) for m in source.get('memberships',[]) if m['franchise']==row['franchise']]})
comparison=collections.Counter();conflicting_scopes=collections.Counter();flag_comparison=collections.Counter();bykey=collections.defaultdict(list)
for state in states:bykey[(state['franchise'],state['slug'],state['round'],state['team'])].append(state)
for key in duplicates:
 values=bykey[key]
 signatures={tuple(r.get(field) for field in ['active','frozen','score','opponent_score','board','finished']) for r in values}
 comparison['same_state' if len(signatures)==1 else 'different_state']+=len(values)-1
 if len(signatures)>1:conflicting_scopes[str((key[1],key[2]))]+=1
 flags={tuple(r.get(field) for field in ['active','frozen']) for r in values}
 flag_comparison['same_active_frozen' if len(flags)==1 else 'different_active_frozen']+=len(values)-1
import datetime
modified={name:datetime.datetime.fromtimestamp((root/name).stat().st_mtime,datetime.timezone.utc).isoformat() for name in ['franchise-teams.json','leagues.json','freezes.json','source-audit.json','report-data.json','validation.json','snapshot.json.gz']}
print(json.dumps({'missing_classification':categories,'missing_examples':examples,'duplicate_comparison':comparison,'flag_comparison':flag_comparison,'conflicting_scopes':conflicting_scopes,'modified_utc':modified}))
print(json.dumps({'missing':len(missing),'groups':collections.Counter(str((r['slug'],r['round'],r.get('lineup_missing',False))) for r in missing),'freeze_audit':freeze['audit'][:30],'freeze_state_count':len(states),'duplicate_state':len(states)-len(keys),'duplicate_groups':collections.Counter(str((key[1],key[2])) for key in duplicates),'duplicate_sources':[{'scope':list(key[:3]),'sources':list({r['source'] for r in states if (r['franchise'],r['slug'],r['round'],r['team'])==key})} for key in duplicates[:3]],'championship_rounds':[{k:r[k] for k in ['round','tour','index']} for l in meta if l['slug']=='championship_2026' for r in l['rounds']],'state_round_counts':collections.Counter(str((r['slug'],r['round'])) for r in states),'round_coverage':sorted({(r['slug'],r['round']) for r in missing})},ensure_ascii=False))
'''
result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', 'deploy',
                         'docker exec -i fantasy-scout-worker /opt/franchises/bin/python -'],
                        input=CODE, text=True, capture_output=True, timeout=45)
if result.returncode:
    raise SystemExit(result.stderr[-1000:])
parts=[json.loads(line) for line in result.stdout.splitlines() if line.strip()]
data = {**parts[0],**parts[1]}
pathlib.Path(__file__).with_name('missing-state-before.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print(json.dumps(data, indent=2))
