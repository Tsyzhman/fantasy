"""Rehearse candidate calendar resolution and all board identities without publishing."""
import json
import pathlib
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
source = pathlib.Path('scripts/franchise-analytics/sources.py').read_text('utf-8')
worker = r'''
import contextlib,io,json,pathlib,sys,tempfile
sys.path.insert(0,'/app/scripts/franchise-analytics')
import research as r
import freezes
candidate={}
exec(CANDIDATE_SOURCE,candidate)
history=HISTORY_DATA
by_slug={}
for record in history:by_slug.setdefault(record['slug'],{})[record['round']]=record
forms=json.loads((r.ROOT/'franchise-teams.json').read_text())
slugs=sorted({f['slug'] for f in forms})
old=json.loads((r.ROOT/'leagues.json').read_text())
def one(slug):
 s=r.soup(r.get('/analytics/fantasy_teams_list/'+slug,{'filter[tours_numbers]':'1;50'}))
 p=r.soup(r.get('/analytics/fantasy_team_players/'+slug,{'ajax':1}))
 rounds=candidate['calendar_rounds'](s,p,by_slug.get(slug,{}))
 for rd in rounds:
  ss=r.soup(r.get('/analytics/competition_tour_shedule/'+str(rd['index']),{'ajax':1}));rd['matches']=[]
  for row in ss.select('tr.match'):
   link=row.select_one('[href*="/football/match/"]');match=r.re.search(r'/football/match/(\d+)',link['href']) if link else None
   rd['matches'].append({'date':row.select_one('.date').get_text(' ',strip=True),'finished':'is_finished' in row.get('class',[]),'text':row.get_text(' ',strip=True),'sports_match_id':match[1] if match else None})
 return {'slug':slug,'league_id':r.LEAGUES[slug],'cid':int(s.select_one('input[name="filter[tournament_id]"]')['value']),'rounds':rounds}
meta=r.pool(one,slugs)
changed=[]
for league in meta:
 before=next(x for x in old if x['slug']==league['slug'])
 for rd in league['rounds']:
  previous=next((x for x in before['rounds'] if x['round']==rd['round']),{})
  if previous.get('index')!=rd['index']:changed.append({'slug':league['slug'],'round':rd['round'],'before':previous.get('index'),'after':rd['index']})
print('CALENDAR',json.dumps({'leagues':len(meta),'rounds':sum(len(x['rounds']) for x in meta),'changed':changed}),flush=True)
with tempfile.TemporaryDirectory(prefix='wi079-calendar-') as directory:
 root=pathlib.Path(directory)
 (root/'leagues.json').write_text(json.dumps(meta));(root/'franchise-teams.json').write_text(json.dumps(forms))
 freezes.ROOT=root
 result={}
 freezes.save=lambda name,data:result.update(data)
 freezes.print=lambda *args,**kwargs:print(*args[:10],**kwargs) if args and args[0]=='FREEZES' else None
 freezes.main()
 print('BOARDS',json.dumps({'states':len(result['states']),'events':len(result['events']),'audit':result['audit']}),flush=True)
'''.replace('CANDIDATE_SOURCE', repr(source))
host = r'''
import json,subprocess
query="SELECT coalesce(json_agg(json_build_object('slug',slug,'round',round,'index',payload->'index','tour',payload->'tour')),'[]'::json) FROM franchise_h2h_rounds WHERE season='2026/2027'"
history=subprocess.run(['docker','exec','fantasy-scout-postgres','psql','-X','-U','fantasy_app','-d','fantasy_scout','-Atq','-v','ON_ERROR_STOP=1','-c',query],capture_output=True,check=True).stdout.decode().strip()
code=WORKER_CODE.replace('HISTORY_DATA',repr(json.loads(history)))
result=subprocess.run(['flock','--exclusive','--timeout','30','/home/deploy/.cache/fantasy-franchises.lock','docker','exec','-i','fantasy-scout-worker','timeout','--signal=TERM','--kill-after=5','600','flock','--exclusive','--no-fork','/app/storage/franchises/.heavy-job.lock','/opt/franchises/bin/python','-'],input=code.encode(),capture_output=True,timeout=640)
print(result.stdout.decode());print(result.stderr.decode());raise SystemExit(result.returncode)
'''.replace('WORKER_CODE', repr(worker))
result = subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ServerAliveInterval=15','deploy','python3 -'],input=host.encode(),capture_output=True,timeout=660)
output=result.stdout.decode('utf-8','replace')+result.stderr.decode('utf-8','replace')
pathlib.Path('specs/work/evidence/WI-079/calendar-rehearsal.txt').write_text(output,encoding='utf-8')
print(output[-12000:])
raise SystemExit(result.returncode)
