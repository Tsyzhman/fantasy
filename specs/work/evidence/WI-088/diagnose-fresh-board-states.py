"""Read-only primary board-state evidence for the 0.3.150 failed aggregate.

No collector, importer, source writes, database access or network in the
diagnostic container. The only persistent write is this chat's local report.
"""
import json
import pathlib
import subprocess

CODE = r'''
import collections,datetime as dt,gzip,hashlib,json,pathlib,re,sys,urllib.parse
from bs4 import BeautifulSoup
sys.path.insert(0,'/app/scripts/franchise-analytics')
from sources import fixture_round,calendar_fixture_scopes
root=pathlib.Path('/app/storage/franchises');scope=(401,'championship_2026',10)
def load(name):return json.loads((root/name).read_text())
def cache(url,ajax=False):
 if not url.startswith('http'):url='https://fantasy-h2h.ru'+url
 if ajax:url+=('?' if '?' not in url else '&')+'ajax=1'
 path=root/'source/http'/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
 if not path.exists():return {'missing_url':url},None
 with gzip.open(path,'rb') as f:raw=f.read(32*1024**2+1)
 if len(raw)>32*1024**2:raise RuntimeError('Cache envelope exceeds bound')
 value=json.loads(raw);assert value['url']==url
 return {'url':url,'file':path.name,'fetched_at':value.get('fetchedAt'),'body_sha256':hashlib.sha256(value['body'].encode()).hexdigest()},value['body']
def soup(body):
 if body.lstrip().startswith('{'):
  value=json.loads(body);body=value.get('data') or value.get('html') or ''
  if isinstance(body,dict):body=body.get('html','')
 return BeautifulSoup(body,'html.parser')
def numeric(value):
 try:return float(value.replace(',','.').strip())
 except (ValueError,AttributeError):return None
def title_date(body):
 value=json.loads(body) if body.lstrip().startswith('{') else {};title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else ''
 match=re.search(r', (\d{2}\.\d{2}\.\d{4})$',title);return match[1] if match else None
freeze=load('freezes.json');selected=[x for x in freeze['states'] if (x['franchise'],x['slug'],x['round'])==scope]
all_groups=collections.defaultdict(list)
for x in freeze['states']:all_groups[(x['franchise'],x['slug'],x['round'],str(x['team']))].append(x)
active_conflicts=[(key,rows) for key,rows in all_groups.items() if len({x.get('active') for x in rows})>1]
frozen_conflicts=[(key,rows) for key,rows in all_groups.items() if len({x.get('frozen') for x in rows})>1]
global_summary={'state_records':len(freeze['states']),'unique_football_state_keys':len(all_groups),'active_conflicting_keys':len(active_conflicts),'frozen_conflicting_keys':len(frozen_conflicts),'active_conflict_scopes':dict(collections.Counter(str(key[:3]) for key,rows in active_conflicts)),'active_samples':[{'scope':list(key[:3]),'team':key[3],'states':[{k:x.get(k) for k in ['source','active','frozen','board']} for x in rows]} for key,rows in active_conflicts[:3]]}
by_team=collections.defaultdict(list)
for row in selected:by_team[str(row['team'])].append(row)
bad={team:rows for team,rows in by_team.items() if len({(x.get('active'),x.get('frozen')) for x in rows})>1}
fields=['team','active','frozen','board','score','opponent_score','finished','source']
sources=sorted({x['source'] for rows in bad.values() for x in rows})
output={'scope':scope,'global_summary':global_summary,'freeze_mtime_utc':dt.datetime.fromtimestamp((root/'freezes.json').stat().st_mtime,dt.timezone.utc).isoformat(),'freeze_sha256':hashlib.sha256((root/'freezes.json').read_bytes()).hexdigest(),'freeze_audit':freeze['audit'],'all_verified_events':sum(e.get('board_verified',False) for e in freeze['events']),'selected_states':len(selected),'conflicting_team_keys':len(bad),'conflicts':[{'team':team,'states':[{key:x.get(key) for key in fields} for x in rows]} for team,rows in sorted(bad.items())],'events':[{key:e.get(key) for key in ['source','valid','finished','board_verified','n','gain']} for e in freeze['events'] if (e['franchise'],e['slug'],e['round'])==scope],'boards':[],'form_columns':[]}
for source in sources:
 info,body=cache(source,True);item={'source':source,'cache':info}
 if body is not None:
  doc=soup(body);item['title_date']=title_date(body);columns=[]
  source_teams={str(x['team']) for x in selected if x['source']==source}
  for column in doc.select('.one_tour_roster td.column'):
   people=[]
   for li in column.select('.roster li'):
    a=li.select_one('a.uname[href]')
    if a is None:continue
    team=a['href'].rstrip('/').split('/')[-1]
    if not team.isdigit():continue
    score=li.select_one('.score');people.append({'team':team,'classes':li.get('class',[]),'score':numeric(score.get_text(' ',strip=True)) if score else None,'active_by_board':'reserve' not in li.get('class',[])})
   columns.append({'franchise_links':sorted({a['href'] for a in column.select('a[href*="/franchise/view/"]')}),'source_team_overlap':len(source_teams&{p['team'] for p in people}),'active_order':[p['team'] for p in people if p['active_by_board']],'people':people})
  item['columns']=columns;doc.decompose()
 output['boards'].append(item)

meta=load('leagues.json');fixture_scopes=calendar_fixture_scopes(meta);months={'Янв':1,'Фев':2,'Мар':3,'Апр':4,'Мая':5,'Май':5,'Июн':6,'Июл':7,'Авг':8,'Сен':9,'Окт':10,'Ноя':11,'Дек':12};dates=collections.defaultdict(set)
def date_ru(value):
 a=value.replace(',','').split();h,m=map(int,a[3].split(':'));return dt.datetime(int(a[2]),months[a[1]],int(a[0]),h,m)
for league in meta:
 for rd in league['rounds']:
  if rd['matches']:dates[(league['slug'],min(date_ru(m['date']) for m in rd['matches']).strftime('%d.%m.%Y'))].add((league['slug'],rd['round']))
output['calendar']=[{'round':rd['round'],'tour':rd['tour'],'index':rd['index'],'first_date':min(date_ru(m['date']) for m in rd['matches']).isoformat() if rd['matches'] else None,'sports_match_ids':sorted({str(m['sports_match_id']) for m in rd['matches'] if m.get('sports_match_id')})} for l in meta if l['slug']==scope[1] for rd in l['rounds'] if rd['round'] in [9,10,11]]
for form in load('franchise-teams.json'):
 if form.get('personal') or (form['franchise'],form['slug'])!=scope[:2]:continue
 info,body=cache(form['url'])
 if body is None:output['form_columns'].append({'cache':info});continue
 doc=soup(body);table=doc.select_one('.players_list table');headers=[td for td in table.select_one('tr.header').find_all('td',recursive=False) if td.select_one('a[href*="team_match_data"]')];rows=table.select('tbody tr[data-player_id]')
 for j,header in enumerate(headers):
  source=header.select_one('a')['href']
  if source not in sources:continue
  item={'source':source,'column':j,'header_label':header.get_text(' ',strip=True),'header_title':header.get('title'),'cache':info};cells=[];tours=set();active_link=None
  for row in rows:
   columns=row.select('td.match')
   if len(columns)<=j:continue
   cell=columns[j];tours.update(a['data-tour_id'] for a in cell.select('a[data-tour_id]'))
   if active_link is None and cell.select_one('.game_number') is not None:active_link=cell.select_one('a.match_result[href]')
   a=next((a for a in row.select('td.uname a[href]') if a['href'].rstrip('/').split('/')[-1].isdigit()),None)
   if a is None:continue
   team=a['href'].rstrip('/').split('/')[-1]
   if team not in bad:continue
   game=cell.select_one('.game_number');cells.append({'team':team,'cell_classes':cell.get('class',[]),'game_number':game.get_text(' ',strip=True) if game else None,'active_by_summary':game is not None,'frozen_by_summary':'exchange' in cell.get('class',[])})
  item['explicit_tours']=sorted(tours);item['conflicting_team_cells']=cells
  if active_link is not None:
   match_info,match_body=cache(active_link['href'],True);item['active_match_cache']=match_info
   if match_body is not None:
    matchdoc=soup(match_body);day=title_date(match_body);title='Fixture A - Fixture B, '+day if day else ''
    item['active_match_title_date']=day
    try:item['independent_fixture_scope']=fixture_round(matchdoc,scope[1],fixture_scopes,dates,title)
    except ValueError as error:item['independent_fixture_error']=str(error)
    matchdoc.decompose()
  output['form_columns'].append(item)
 doc.decompose()
print(json.dumps(output,ensure_ascii=False),flush=True)
'''

REMOTE = r'''
import json,pathlib,subprocess
available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
assert available>=2*1024**3,'Insufficient diagnostic headroom'
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0]
env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v);commit=env.get('APP_RELEASE_COMMIT','');assert commit.startswith('1c9264f')
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');assert mount['Type']=='volume'
name='fantasy-scout-franchises-diagnostic-wi088'
args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','none','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",worker['Image'],'timeout','--signal=TERM','--kill-after=5','50','/opt/franchises/bin/python','-']
result=subprocess.run(args,input=CODE,text=True,capture_output=True,timeout=60)
if result.returncode:raise SystemExit(result.stderr[-1500:]+result.stdout[-1500:])
remaining=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,timeout=10).stdout.strip()
print(json.dumps({'configuration':{'available_before_bytes':available,'image':worker['Image'],'commit':commit,'memory_bytes':1024**3,'cpus':1,'network':'none','source_readonly':True},'diagnostic':json.loads(result.stdout),'diagnostic_exit':result.returncode,'remaining_container':remaining},ensure_ascii=False))
'''.replace('input=CODE,', 'input=' + repr(CODE) + ',')

if __name__ == '__main__':
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'],
                            input=REMOTE, text=True, encoding='utf-8', capture_output=True, timeout=80)
    if result.returncode:
        raise SystemExit(result.stderr[-1500:])
    data = json.loads(result.stdout)
    pathlib.Path(__file__).with_name('fresh-board-state-conflict.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    value = data['diagnostic']
    print(json.dumps({'configuration': data['configuration'], 'scope': value['scope'], 'global_summary': value['global_summary'], 'conflicting_team_keys': value['conflicting_team_keys'],
                      'conflicts': value['conflicts'], 'form_columns': value['form_columns'],
                      'remaining_container': data['remaining_container']}, ensure_ascii=False, indent=2))
