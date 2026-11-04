"""Bounded cache-only rehearsal of uncommitted fixture/board corrections.

No sync, freezes.main, database connection, source write or publication. Only
local evidence and disposable public-code transport files are written.
"""
import base64
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile

EVIDENCE = pathlib.Path(__file__).resolve().parent
REPO = EVIDENCE.parents[3]

CODE = r'''
import ast,collections,datetime as dt,gc,gzip,hashlib,json,pathlib,re,sys,time,urllib.parse
from bs4 import BeautifulSoup
sys.path.insert(0,'/opt/wi088-candidate')
from sources import fixture_round,calendar_fixture_scopes
root=pathlib.Path('/app/storage/franchises');started=time.monotonic();reads=0;checked=0;fallbacks=0;forms_checked=0
months={'Янв':1,'Фев':2,'Мар':3,'Апр':4,'Мая':5,'Май':5,'Июн':6,'Июл':7,'Авг':8,'Сен':9,'Окт':10,'Ноя':11,'Дек':12}
run_start='2026-11-04T11:42:00Z';used_times=[]
class MissingCache(Exception):pass
def cached(url,params=None):
 global reads
 if not url.startswith('http'):url='https://fantasy-h2h.ru'+url
 if params:url+=('?' if '?' not in url else '&')+urllib.parse.urlencode(params)
 path=root/'source/http'/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
 if not path.exists():raise MissingCache(url)
 with gzip.open(path,'rb') as f:raw=f.read(32*1024**2+1)
 if len(raw)>32*1024**2:raise RuntimeError('Cache envelope exceeds diagnostic bound')
 value=json.loads(raw);assert value['url']==url
 reads+=1;used_times.append(value.get('fetchedAt',''))
 return value['body']
def soup(body):
 if body.lstrip().startswith('{'):
  value=json.loads(body);body=value.get('data') or value.get('html') or ''
  if isinstance(body,dict):body=body.get('html','')
 return BeautifulSoup(body,'html.parser')
def date_ru(value):
 a=value.replace(',','').split();h,m=map(int,a[3].split(':'));return dt.datetime(int(a[2]),months[a[1]],int(a[0]),h,m)-dt.timedelta(hours=3)
def finish(status,**values):
 print(json.dumps({'status':status,'checked_columns':checked,'checked_forms':forms_checked,'fallbacks':fallbacks,'cache_reads':reads,'source_scoped_synthetic_verification':source_verified,'cache_fetched_from':min(used_times) if used_times else None,'cache_fetched_to':max(used_times) if used_times else None,'pre_run_cache_reads':sum(t<run_start for t in used_times),'seconds':round(time.monotonic()-started,3),**values},ensure_ascii=False),flush=True)
 raise SystemExit(2 if status=='conflict' else 0)

# Execute only the candidate's nested verification function with two tiny fake
# board responses. Do not import freezes or execute its main/acquisition code.
tree=ast.parse(pathlib.Path('/opt/wi088-candidate/freezes.py').read_text())
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
verify_node=next(n for n in main.body if isinstance(n,ast.FunctionDef) and n.name=='verify')
states=[];events=[];responses={}
for source,active,reserve,multiplier in [('board-a',[1,2,3,4,5,6],7,10),('board-b',[1,2,3,4,5,7],6,100)]:
 people=[]
 for team in range(1,8):
  row={'franchise':1,'slug':'synthetic','round':1,'team':str(team),'active':team in active,'frozen':team==reserve,'score':team*multiplier,'opponent_score':1,'board':active.index(team)+1 if team in active else None,'source':source}
  states.append(row);people.append(row)
 event={'franchise':1,'slug':'synthetic','round':1,'source':source,'n':1,'substitutes':[next(x for x in people if x['team']==str(active[-1]))],'frozen':[next(x for x in people if x['team']==str(reserve))]};events.append(event)
 def person(team,res=False):return '<li class="'+('reserve' if res else '')+'"><a class="uname" href="https://fantasy-h2h.ru/team/'+str(team)+'">Fixture</a><span class="score">'+str(team*multiplier)+'</span></li>'
 own=''.join(person(team) for team in active)+person(reserve,True);other=''.join(person(team) for team in range(101,107))
 responses[source]='<div class="one_tour_roster"><table><tr><td class="column"><ul class="roster">'+own+'</ul></td><td class="column"><ul class="roster">'+other+'</ul></td></tr></table></div>'
namespace={'states':states,'soup':soup,'get':lambda source,params=None:responses[source],'num':lambda value:float(value)}
exec(compile(ast.Module(body=[verify_node],type_ignores=[]),'<candidate verify(event)>','exec'),namespace)
for event in events:namespace['verify'](event)
source_verified=all(e['board_verified'] and all(p['source']==e['source'] for p in e['substitutes']+e['frozen']) for e in events)
assert source_verified and events[0]['gain']==-10 and events[1]['gain']==100
del namespace,states,events,responses,tree

meta=json.loads((root/'leagues.json').read_text());forms=json.loads((root/'franchise-teams.json').read_text())
fixtures=calendar_fixture_scopes(meta);dates=collections.defaultdict(set);tourmap={r['tour']:(l['slug'],r['round']) for l in meta for r in l['rounds']}
for league in meta:
 for rd in league['rounds']:
  if rd['matches']:
   day=(min(date_ru(m['date']) for m in rd['matches'])+dt.timedelta(hours=3)).strftime('%d.%m.%Y');dates[(league['slug'],day)].add((league['slug'],rd['round']))
known_fixed=None
for form in forms:
 if form.get('personal'):continue
 if forms_checked>=2048 or checked>=20000 or time.monotonic()-started>150:finish('bound_reached')
 context={'franchise':form['franchise'],'slug':form['slug'],'form_url':form['url']}
 try:body=cached(form['url'])
 except MissingCache as error:finish('cache_missing',missing_url=str(error),**context)
 doc=soup(body);table=doc.select_one('.players_list table');header=table.select_one('tr.header')
 headers=[c for c in header.find_all('td',recursive=False) if c.select_one('a[href*="team_match_data"]')]
 grid=[tr.select('td.match') for tr in table.select('tbody tr[data-player_id]')]
 for j,hc in enumerate(headers):
  checked+=1;cells=[row[j] for row in grid if len(row)>j];tours={int(a['data-tour_id']) for td in cells for a in td.select('a[data-tour_id]')}
  context.update(column=j,board_url=hc.select_one('a')['href'])
  if len(tours)>1:finish('conflict',reason='multiple explicit H2H tour IDs',explicit_tours=sorted(tours),**context)
  if tours:
   if next(iter(tours)) not in tourmap:finish('conflict',reason='unknown explicit H2H tour ID',explicit_tours=sorted(tours),**context)
   continue
  link=next((td.select_one('a.match_result[href]') for td in cells if td.select_one('a.match_result[href]')),None)
  if link is None:finish('conflict',reason='no explicit tour or fallback match',**context)
  fallbacks+=1;context['fallback_url']=link['href']
  try:body=cached(link['href'],{'ajax':1})
  except MissingCache as error:finish('cache_missing',missing_url=str(error),known_fixed=known_fixed,**context)
  value=json.loads(body) if body.lstrip().startswith('{') else {};title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else '';matchdoc=soup(body)
  try:
   scope=fixture_round(matchdoc,form['slug'],fixtures,dates,title)
   if scope is None:finish('conflict',reason='no recognized fixture or date identity',**context)
   if context['board_url']=='https://fantasy-h2h.ru/h2h/team_match_data/520404':known_fixed={'board_url':context['board_url'],'scope':scope}
  except ValueError as error:
   ids=set()
   for a in matchdoc.select('.roster.this_tour li:not(.prev) [href*="/football/match/"]'):
    parsed=urllib.parse.urlsplit(a['href']);match=re.fullmatch(r'/football/match/(\d+)/?',parsed.path)
    if parsed.hostname in {'sports.ru','www.sports.ru'} and match:ids.add(match[1])
   date=re.search(r', (\d{2}\.\d{2}\.\d{4})$',title);day=date[1] if date else None
   finish('conflict',reason=str(error),title_date=day,date_scopes=sorted(dates.get((form['slug'],day),set())),match_candidates=[{'sports_match_id':mid,'scopes':sorted(fixtures.get((form['slug'],mid),set()))} for mid in sorted(ids)],known_fixed=known_fixed,**context)
  finally:matchdoc.decompose()
 doc.decompose();forms_checked+=1;gc.collect()
finish('completed',known_fixed=known_fixed)
'''


def main():
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as archive:
        for name in ['sources.py', 'freezes.py']:
            archive.add(REPO / 'scripts/franchise-analytics' / name, arcname=name, recursive=False)
    payload = stream.getvalue()
    remote = r'''
import base64,hashlib,io,json,os,pathlib,subprocess,tarfile,tempfile
available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
assert available>=2*1024**3,'Insufficient headroom for a 1 GiB diagnostic'
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0]
env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v);assert env.get('APP_RELEASE_COMMIT','').startswith('269980b')
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');assert mount['Type']=='volume'
payload=base64.b64decode(PAYLOAD);assert hashlib.sha256(payload).hexdigest()==EXPECTED_HASH
configuration={'available_before_bytes':available,'image':worker['Image'],'commit':env['APP_RELEASE_COMMIT'],'memory_bytes':1024**3,'cpus':1,'network':'none','source_readonly':True,'candidate_archive_sha256':EXPECTED_HASH}
print(json.dumps({'configuration':configuration}),flush=True)
name='fantasy-scout-franchises-diagnostic-wi088'
with tempfile.TemporaryDirectory(prefix='wi088-candidate-') as temporary:
 os.chmod(temporary,0o755)
 with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
  for member in archive.getmembers():
   assert member.name in ['sources.py','freezes.py'] and member.isfile()
  archive.extractall(temporary)
 for path in pathlib.Path(temporary).iterdir():os.chmod(path,0o644)
 args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','none','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",'--mount',f'type=bind,src={temporary},dst=/opt/wi088-candidate,readonly',worker['Image'],'timeout','--signal=TERM','--kill-after=5','170','/opt/franchises/bin/python','-']
 result=subprocess.run(args,input=CODE,text=True,capture_output=True,timeout=180)
 if result.returncode not in [0,2]:raise SystemExit(result.stderr[-1500:]+result.stdout[-1500:])
 remaining=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,timeout=10).stdout.strip()
 print(json.dumps({'configuration':configuration,'rehearsal':json.loads(result.stdout),'diagnostic_exit':result.returncode,'remaining_container':remaining},ensure_ascii=False))
'''.replace('PAYLOAD', repr(base64.b64encode(payload).decode())).replace('EXPECTED_HASH', repr(hashlib.sha256(payload).hexdigest())).replace('input=CODE,', 'input=' + repr(CODE) + ',')
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'],
                            input=remote, text=True, encoding='utf-8', capture_output=True, timeout=200)
    if result.returncode:
        raise SystemExit(result.stderr[-1500:])
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    value = lines[-1]
    (EVIDENCE / 'fixture-correction-rehearsal.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(value, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
