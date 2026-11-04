"""Reproduce the fresh Nov 4 calendar identity failure without network or writes.

Only the local evidence JSON is written. The remote diagnostic uses the exact
269980b worker image, a read-only root/source volume, network none, 1 GiB and one
CPU. It imports only sources.fixture_round, never research/freezes/sync/import.
"""
import json
import pathlib
import subprocess

DIAGNOSTIC = r'''
import collections,datetime as dt,gzip,hashlib,json,pathlib,re,sys,urllib.parse
from bs4 import BeautifulSoup
sys.path.insert(0,'/app/scripts/franchise-analytics')
from sources import fixture_round
root=pathlib.Path('/app/storage/franchises')
slug='la_liga_2026';form_url='https://fantasy-h2h.ru/form/view/h2h_tournament_franchise/15924'
board_url='https://fantasy-h2h.ru/h2h/team_match_data/520404'
fallback='https://fantasy-h2h.ru/h2h/match_data/8020124?v=721271&ajax=1'
months={'Янв':1,'Фев':2,'Мар':3,'Апр':4,'Мая':5,'Май':5,'Июн':6,'Июл':7,'Авг':8,'Сен':9,'Окт':10,'Ноя':11,'Дек':12}
def date_ru(value):
 a=value.replace(',','').split();h,m=map(int,a[3].split(':'));return dt.datetime(int(a[2]),months[a[1]],int(a[0]),h,m)-dt.timedelta(hours=3)
def cache(url):
 path=root/'source/http'/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
 if not path.exists():raise RuntimeError('Missing cached response: '+url)
 with gzip.open(path,'rb') as source:raw=source.read(32*1024**2+1)
 if len(raw)>32*1024**2:raise RuntimeError('Cache envelope exceeds bound')
 value=json.loads(raw)
 if value['url']!=url:raise RuntimeError('Cache identity mismatch')
 return value['body'],{'url':url,'file':path.name,'fetched_at':value.get('fetchedAt'),'body_sha256':hashlib.sha256(value['body'].encode()).hexdigest()}
def soup(body):
 if body.lstrip().startswith('{'):
  value=json.loads(body);body=value.get('data') or value.get('html') or ''
  if isinstance(body,dict):body=body.get('html','')
 return BeautifulSoup(body,'html.parser')
meta=json.loads((root/'leagues.json').read_text());last={};all_scopes=collections.defaultdict(set);members=collections.defaultdict(list);dates=collections.defaultdict(set)
for league in meta:
 for rd in league['rounds']:
  scope=(league['slug'],rd['round'])
  for m in rd['matches']:
   if m.get('sports_match_id'):
    key=(league['slug'],str(m['sports_match_id']));last[key]=scope;all_scopes[key].add(scope)
    members[key].append({'round':rd['round'],'index':rd['index'],'tour':rd['tour'],'date':m['date']})
  if rd['matches']:
   day=(min(date_ru(m['date']) for m in rd['matches'])+dt.timedelta(hours=3)).strftime('%d.%m.%Y');dates[(league['slug'],day)].add(scope)
form_body,form_cache=cache(form_url);form=soup(form_body);table=form.select_one('.players_list table')
headers=[td for td in table.select_one('tr.header').find_all('td',recursive=False) if td.select_one('a[href*="team_match_data"]')]
j=next(i for i,td in enumerate(headers) if td.select_one('a')['href']==board_url)
cells=[tr.select('td.match')[j] for tr in table.select('tbody tr[data-player_id]') if len(tr.select('td.match'))>j]
tours={a['data-tour_id'] for td in cells for a in td.select('a[data-tour_id]')}
assert not tours,'The targeted board no longer uses fixture fallback'
body,response_cache=cache(fallback);value=json.loads(body);title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else ''
doc=soup(body);observed=set()
for a in doc.select('.roster.this_tour li:not(.prev) [href*="/football/match/"]'):
 parsed=urllib.parse.urlsplit(a['href']);match=re.fullmatch(r'/football/match/(\d+)/?',parsed.path)
 if parsed.hostname in {'sports.ru','www.sports.ru'} and match:observed.add(match[1])
date=re.search(r', (\d{2}\.\d{2}\.\d{4})$',title);day=date[1] if date else None
rejection=None
try:fixture_round(doc,slug,last,dates,title)
except ValueError as error:rejection=str(error)
candidate_sets=[all_scopes[(slug,mid)] for mid in observed if all_scopes.get((slug,mid))]
common=set.intersection(*candidate_sets) if candidate_sets else set()
dated=dates.get((slug,day),set());joint=common&dated if common and dated else common or dated
primary=[]
for league in meta:
 if league['slug']!=slug:continue
 for rd in league['rounds']:
  if rd['round'] not in [8,9,10]:continue
  url='https://fantasy-h2h.ru/analytics/competition_tour_shedule/'+str(rd['index'])+'?ajax=1'
  raw,info=cache(url);calendar=soup(raw);rows=[]
  for row in calendar.select('tr.match'):
   link=row.select_one('[href*="/football/match/"]');mid=re.search(r'/football/match/(\d+)',link['href']) if link else None
   datecell=row.select_one('.date')
   rows.append({'sports_match_id':mid[1] if mid else None,'h2h_match_id':row.get('data-match_id'),'date':datecell.get_text(' ',strip=True) if datecell else None,'finished':'is_finished' in row.get('class',[]),'canceled':'is_canceled' in row.get('class',[])})
  primary.append({'round':rd['round'],'index':rd['index'],'tour':rd['tour'],'cache':info,'rows':rows});calendar.decompose()
out={'form_url':form_url,'board_url':board_url,'column':j,'form_cache':form_cache,'fallback_cache':response_cache,'explicit_tours':sorted(tours),'title_date':day,'current_rejection':rejection,'current_last_write_fixture_scopes':sorted({last[(slug,mid)] for mid in observed if (slug,mid) in last}),'all_observed_memberships':[{'sports_match_id':mid,'memberships':members[(slug,mid)]} for mid in sorted(observed)],'duplicate_calendar_fixture_identities':[{'slug':key[0],'sports_match_id':key[1],'memberships':members[key]} for key,scopes in all_scopes.items() if len(scopes)>1],'date_scopes':sorted(dated),'retained_candidate_intersection':sorted(common),'joint_candidates_with_date':sorted(joint),'primary_calendar':primary}
assert rejection=='Conflicting board fixture identity'
assert joint=={(slug,9)}
print(json.dumps(out,ensure_ascii=False),flush=True)
'''

REMOTE = r'''
import json,subprocess
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0]
env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v)
commit=env.get('APP_RELEASE_COMMIT','');assert commit.startswith('269980b'),'Unexpected worker revision'
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');assert mount['Type']=='volume'
name='fantasy-scout-franchises-diagnostic-wi088'
args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','none','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",worker['Image'],'timeout','--signal=TERM','--kill-after=5','30','/opt/franchises/bin/python','-']
result=subprocess.run(args,input=DIAGNOSTIC,text=True,capture_output=True,timeout=40)
if result.returncode:raise SystemExit(result.stderr[-1000:]+result.stdout[-1000:])
remaining=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,timeout=10).stdout.strip()
print(json.dumps({'configuration':{'commit':commit,'image':worker['Image'],'memory_bytes':1024**3,'cpus':1,'network':'none','root_readonly':True,'source_readonly':True},'result':json.loads(result.stdout),'diagnostic_exit':result.returncode,'remaining_container':remaining},ensure_ascii=False))
'''.replace('input=DIAGNOSTIC,', 'input=' + repr(DIAGNOSTIC) + ',')

if __name__ == '__main__':
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'],
                            input=REMOTE, text=True, encoding='utf-8', capture_output=True, timeout=55)
    if result.returncode:
        raise SystemExit(result.stderr[-1000:])
    data = json.loads(result.stdout)
    pathlib.Path(__file__).with_name('fresh-fixture-conflict.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'configuration': data['configuration'], 'current_rejection': data['result']['current_rejection'],
                      'joint_candidates_with_date': data['result']['joint_candidates_with_date'],
                      'remaining_container': data['remaining_container']}, ensure_ascii=False, indent=2))
