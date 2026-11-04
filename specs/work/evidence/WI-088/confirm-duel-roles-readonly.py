"""Bounded primary-role confirmation, including root-authorized public GETs.

Three exact board URLs maximum, no retries, 15-second HTTP timeouts, response
bound 8 MiB. Source/root stay read-only. No source cache writes or collector.
"""
import json
import pathlib
import subprocess

CODE = r'''
import collections,datetime as dt,gzip,hashlib,json,pathlib,re,urllib.request
from bs4 import BeautifulSoup
root=pathlib.Path('/app/storage/franchises');freeze=json.loads((root/'freezes.json').read_text());names={f['id']:f['name'] for f in json.loads((root/'franchises.json').read_text())}
groups=collections.defaultdict(list)
for row in freeze['states']:groups[(row['franchise'],row['slug'],row['round'],str(row['team']))].append(row)
active={key:rows for key,rows in groups.items() if len({x.get('active') for x in rows})>1}
frozen={key:rows for key,rows in groups.items() if len({x.get('frozen') for x in rows})>1}
frozen_only={key:rows for key,rows in frozen.items() if key not in active}
def category(rows):
 scopes=collections.Counter(key[:3] for key in rows)
 return {'keys':len(rows),'franchises':len({key[0] for key in rows}),'league_rounds':len({key[1:3] for key in rows}),'scopes':[{'franchise':key[0],'name':names[key[0]],'slug':key[1],'round':key[2],'keys':count} for key,count in sorted(scopes.items())]}
summary={'active':category(active),'frozen':category(frozen),'frozen_only':category(frozen_only),'all_conflicting_keys':len(set(active)|set(frozen)),'examples':[{'franchise':key[0],'name':names[key[0]],'slug':key[1],'round':key[2],'team':key[3],'states':[{k:r.get(k) for k in ['source','active','frozen','board','score']} for r in rows]} for key,rows in list(frozen_only.items())[:1]+list(active.items())[:2]]}
targets=['https://fantasy-h2h.ru/h2h/team_match_data/514501','https://fantasy-h2h.ru/h2h/team_match_data/538054','https://fantasy-h2h.ru/h2h/team_match_data/538094'];proof=[]
for source in targets:
 url=source+'?ajax=1';request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; bounded-readonly-diagnostic)','X-Requested-With':'XMLHttpRequest','Accept-Language':'ru'})
 try:
  with urllib.request.urlopen(request,timeout=15) as response:
   raw=response.read(8*1024**2+1);status=response.status
  if len(raw)>8*1024**2:raise RuntimeError('Response exceeds 8 MiB')
  body=raw.decode('utf-8');value=json.loads(body) if body.lstrip().startswith('{') else {};title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else '';match=re.search(r', (\d{2}\.\d{2}\.\d{4})$',title)
  html=value.get('data') or value.get('html') or body
  if isinstance(html,dict):html=html.get('html','')
  doc=BeautifulSoup(html,'html.parser');columns=[]
  source_states=[r for r in freeze['states'] if r['source']==source];by_team={str(r['team']):r for r in source_states}
  for index,column in enumerate(doc.select('.one_tour_roster td.column')):
   people=[]
   for li in column.select('.roster li'):
    a=li.select_one('a.uname[href]')
    if a is None:continue
    team=a['href'].rstrip('/').split('/')[-1]
    if not team.isdigit():continue
    state=by_team.get(team);person={'team':team,'classes':li.get('class',[]),'active_by_html':'reserve' not in li.get('class',[])}
    if state:person['parsed_state']={k:state.get(k) for k in ['franchise','active','frozen','board']}
    people.append(person)
   columns.append({'index':index,'participants':people})
  proof.append({'url':url,'http_status':status,'retrieved_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'response_bytes':len(raw),'body_sha256':hashlib.sha256(raw).hexdigest(),'title_date':match[1] if match else None,'columns':columns});doc.decompose()
 except Exception as error:proof.append({'url':url,'error':str(error)[:300]})
print(json.dumps({'freeze_sha256':hashlib.sha256((root/'freezes.json').read_bytes()).hexdigest(),'summary':summary,'primary_gets':proof,'source_cache_written':False},ensure_ascii=False),flush=True)
'''

REMOTE = r'''
import json,pathlib,subprocess
available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'));assert available>=2*1024**3
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0]
env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v);assert env.get('APP_RELEASE_COMMIT','').startswith('1c9264f')
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');assert mount['Type']=='volume'
name='fantasy-scout-franchises-diagnostic-wi088'
args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','bridge','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",worker['Image'],'timeout','--signal=TERM','--kill-after=5','65','/opt/franchises/bin/python','-']
result=subprocess.run(args,input=CODE,text=True,capture_output=True,timeout=75)
if result.returncode:raise SystemExit(result.stderr[-1500:]+result.stdout[-1500:])
remaining=subprocess.run(['docker','ps','-aq','--filter','name=^/'+name+'$'],capture_output=True,text=True,timeout=10).stdout.strip()
print(json.dumps({'configuration':{'available_before_bytes':available,'image':worker['Image'],'commit':env['APP_RELEASE_COMMIT'],'memory_bytes':1024**3,'cpus':1,'network':'bridge for three exact read-only GETs','source_readonly':True},'diagnostic':json.loads(result.stdout),'diagnostic_exit':result.returncode,'remaining_container':remaining},ensure_ascii=False))
'''.replace('input=CODE,', 'input=' + repr(CODE) + ',')

if __name__ == '__main__':
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'],
                            input=REMOTE, text=True, encoding='utf-8', capture_output=True, timeout=90)
    if result.returncode:
        raise SystemExit(result.stderr[-1500:])
    data = json.loads(result.stdout)
    pathlib.Path(__file__).with_name('fresh-duel-role-confirmation.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'summary':data['diagnostic']['summary'],'primary_gets':[{k:x.get(k) for k in ['url','http_status','title_date','error']} for x in data['diagnostic']['primary_gets']],'remaining_container':data['remaining_container']},ensure_ascii=True,indent=2))
