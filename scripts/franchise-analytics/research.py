"""Deterministic acquisition. @spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
import sys,pathlib,json,gzip,hashlib,time,urllib.request,urllib.parse,subprocess,re,concurrent.futures,shlex,datetime
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')
ROOT=pathlib.Path(os.environ.get('FRANCHISE_DATA_DIR',str(pathlib.Path.cwd()/'storage/franchises'))).resolve()
CACHE=ROOT/'source'/'http';CACHE.mkdir(parents=True,exist_ok=True)
BASE='https://fantasy-h2h.ru'
IDS=[503,19,65,5,18,433,223,40,401,27,25,23]
LEAGUES={'rfpl_2026':63,'portugal_2026':61,'eredivisie_2026':57,'championship_2026':48,'turkey_2026':71,'la_liga_2026':87,'epl_2026':47,'seria_a_2026':55,'france_2026':53,'bundesliga_2026':54,'ucl_2026':42,'liga_europa_2026':73,'fnl_2026':None,'khl_2026':None,'nhl_2026':None}
def save(name,data):
 (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def get(url,params=None):
 if not url.startswith('http'):url=BASE+url
 if params:url+=('?' if '?' not in url else '&')+urllib.parse.urlencode(params)
 key=hashlib.sha256(url.encode()).hexdigest();p=CACHE/(key+'.json.gz')
 if p.exists() and (os.environ.get('FRANCHISE_USE_CACHE')=='1' or time.time()-p.stat().st_mtime<1800):return json.loads(gzip.decompress(p.read_bytes()))['body']
 for i in range(5):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; local-franchise-analysis/1.0)','X-Requested-With':'XMLHttpRequest' if params and params.get('ajax') else '','Accept-Language':'ru'})
   if os.environ.get('FRANCHISE_HTTP_SSH'):
    # Optional read-only relay for networks with broken local DNS. TLS remains verified.
    host=urllib.parse.urlparse(url).hostname
    if host!='fantasy-h2h.ru':raise ValueError('Unexpected H2H host')
    result=subprocess.run(['ssh','-o','BatchMode=yes',os.environ['FRANCHISE_HTTP_SSH'], 'curl -fsSL --max-time 40 '+shlex.quote(url)],capture_output=True,check=True)
    b=result.stdout.decode('utf-8')
   else:
    with urllib.request.urlopen(req,timeout=40) as r:b=r.read().decode('utf-8')
   p.write_bytes(gzip.compress(json.dumps({'url':url,'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'body':b},ensure_ascii=False).encode(),compresslevel=6));return b
  except Exception:
   if i==4:raise
   time.sleep(1+i*2)
def soup(body):
 if body.lstrip().startswith('{'):
  d=json.loads(body);body=d.get('data') or d.get('html') or ''
  if isinstance(body,dict):body=body.get('html','')
 return BeautifulSoup(body,'html.parser')
def pool(fn,jobs,workers=4):
 out=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as e:
  fs={e.submit(fn,j):j for j in jobs}
  for n,f in enumerate(concurrent.futures.as_completed(fs),1):
   try:out.append(f.result())
   except Exception as ex:print('ERROR',fs[f],str(ex),flush=True);raise
   if n%40==0:print('progress',n,'/',len(jobs),flush=True)
 return out
def db(name,query):
 path=ROOT/'source'/(name+'.jsonl.gz')
 if path.exists() and os.environ.get('FRANCHISE_USE_CACHE')=='1':return
 env=os.environ.copy()
 if env.get('DATABASE_URL') and not env.get('FRANCHISE_SSH'):
  env['PGDATABASE']=env['DATABASE_URL'].split('?schema=')[0]
  command=['psql','-Atq','-v','ON_ERROR_STOP=1']
 else:
  command=['ssh','-o','BatchMode=yes',env.get('FRANCHISE_SSH','deploy'),'docker exec -i fantasy-scout-postgres psql -U fantasy_app -d fantasy_scout -Atq -v ON_ERROR_STOP=1']
 sql="BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='120s'; SET LOCAL work_mem='16MB'; "+query+"; COMMIT;"
 # Stream to gzip: do not retain the full normalized history in a subprocess buffer.
 proc=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
 proc.stdin.write(sql.encode());proc.stdin.close();size=0
 tmp=path.with_suffix('.tmp')
 with gzip.open(tmp,'wb',compresslevel=6) as target:
  while chunk:=proc.stdout.read(1024*1024):target.write(chunk);size+=len(chunk)
 error=proc.stderr.read();code=proc.wait()
 if code:tmp.unlink(missing_ok=True);raise RuntimeError('Read-only database export failed: '+name)
 tmp.replace(path);print('DB',name,size,'bytes',flush=True)
def read_db(name):return [json.loads(x) for x in gzip.decompress((ROOT/'source'/(name+'.jsonl.gz')).read_bytes()).splitlines() if x]
def settled(rd):
 # Give final point corrections a day; completed lineups then become immutable cache entries.
 months={'Янв':1,'Фев':2,'Мар':3,'Апр':4,'Мая':5,'Май':5,'Июн':6,'Июл':7,'Авг':8,'Сен':9,'Окт':10,'Ноя':11,'Дек':12}
 if not rd['matches'] or not all(m['finished'] for m in rd['matches']):return False
 dates=[]
 for m in rd['matches']:
  a=m['date'].replace(',','').split();h,mi=map(int,a[3].split(':'));dates.append(datetime.datetime(int(a[2]),months[a[1]],int(a[0]),h,mi,tzinfo=datetime.timezone(datetime.timedelta(hours=3))))
 return max(dates)<datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=27)
def franchises():
 def one(fid):
  s=soup(get('/franchise/view/'+str(fid)));name=s.select_one('meta[property="og:title"]')['content']
  forms=[]
  for div in s.select('[id^="fnts_tournaments_list_26_"][id$="_content"]'):
   m=re.search(r'_26_(\d+)_',div['id'])
   if not m:continue
   cid=int(m[1]);a=div.select_one('a[data-url]')
   if a:forms.append({'cid':cid,'name':a.get_text(' ',strip=True),'slug':a.get('data-name'),'url':a['data-url']})
  roster=[{'name':a.text.strip(),'url':a['href']} for a in s.select('table[id^="franchise_roster"] a.cu_name')]
  return {'id':fid,'name':name,'forms':forms,'roster':roster}
 fr=sorted(pool(one,IDS),key=lambda x:IDS.index(x['id']));save('franchises.json',fr)
 def form(job):
  fid,entry=job;s=soup(get(entry['url']));teams=[]
  for tr in s.select('.players_list tbody tr'):
   a=next((a for a in tr.select('td.uname a[href]') if a['href'].rstrip('/').split('/')[-1].isdigit()),None)
   if a:teams.append({'team_id':a['href'].rstrip('/').split('/')[-1],'manager':a.get_text(' ',strip=True),'url':a['href'],'row':tr.get_text(' ',strip=True),'attributes':tr.attrs})
  return {'franchise':fid,**entry,'teams':teams,'text':s.get_text(' ',strip=True)}
 forms=pool(form,[(f['id'],j) for f in fr for j in f['forms']]);save('franchise-teams.json',forms)
 print('Franchises',[(f['id'],f['name'],len(f['forms'])) for f in fr]);print('forms',len(forms),'teams',sum(len(f['teams']) for f in forms))
def metadata():
 forms=json.loads((ROOT/'franchise-teams.json').read_text('utf-8'));slugs=sorted({next(k for k in LEAGUES if f['slug'].startswith(k)) for f in forms})
 def one(slug):
  s=soup(get('/analytics/fantasy_teams_list/'+slug,{'filter[tours_numbers]':'1;50'}))
  rounds={int(re.search(r'\d+',x.text)[0]):{'round':int(re.search(r'\d+',x.text)[0]),'index':int(x['value'])} for x in s.select('select[name="filter[roster_stat][index]"] option')}
  for th in s.select('th[data-field^="tour_score_"]'):
   rn=int(re.search(r'\d+',th.text)[0]);
   if rn not in rounds:
    last=max(rounds);rounds[rn]={'round':rn,'index':rounds[last]['index']-(last-rn),'index_inferred':True}
   rounds[rn]['tour']=int(th['data-field'].split('_')[-1])
  cid=int(s.select_one('input[name="filter[tournament_id]"]')['value'])
  for rn,r in rounds.items():
   ss=soup(get('/analytics/competition_tour_shedule/'+str(r['index']),{'ajax':1}))
   r['matches']=[{'date':x.select_one('.date').get_text(' ',strip=True),'finished':'is_finished' in x.get('class',[]),'text':x.get_text(' ',strip=True)} for x in ss.select('tr.match')]
  return {'slug':slug,'league_id':LEAGUES[slug],'cid':cid,'rounds':list(sorted(rounds.values(),key=lambda r:r['round']))}
 m=pool(one,slugs);save('leagues.json',m);print([(x['slug'],len(x['rounds'])) for x in m])
def players():
 meta=json.loads((ROOT/'leagues.json').read_text('utf-8'))
 def one(job):
  lg,rd=job;rows=[];offset=0
  dest=ROOT/'source'/f"players-{lg['slug']}-{rd['round']}.json"
  marker=dest.with_suffix('.complete')
  if dest.exists() and marker.exists():return (lg['slug'],rd['round'],len(json.loads(dest.read_text('utf-8'))))
  while True:
   s=soup(get('/analytics/fantasy_team_players/'+lg['slug'],{'ajax':1,'offset':offset,'filter[popularity_index]':rd['index']}))
   cols=[t.get('data-field') for t in s.select('th[data-field]')]
   trs=s.select('tr[data-item_id]')
   for tr in trs:
    cells=tr.find_all('td',recursive=False)
    row={'id':tr['data-item_id'],'slug':lg['slug'],'round':rd['round']}
    row.update({k:v.get_text(' ',strip=True) for k,v in zip(cols,cells) if k not in ['links','last_games']})
    if 'last_games' in cols:
     row['last_games']=[{'text':el.text.strip(),'class':el.get('class'),'url':el.get('data-tooltip_url')} for el in cells[cols.index('last_games')].select('.score')]
    rows.append(row)
   if len(trs)<100:break
   offset+=100
  save('source/players-'+lg['slug']+'-'+str(rd['round'])+'.json',rows)
  if settled(rd):marker.write_text('complete',encoding='utf-8')
  return (lg['slug'],rd['round'],len(rows))
 result=pool(one,[(l,r) for l in meta for r in l['rounds']]);save('players-coverage.json',result);print(result)
def squads():
 meta=json.loads((ROOT/'leagues.json').read_text('utf-8'));forms=json.loads((ROOT/'franchise-teams.json').read_text('utf-8'));jobs=[]
 for form in forms:
  lg=next(l for l in meta if l['cid']==form['cid'])
  for team in form['teams']:
   for rd in lg['rounds']:
    if rd.get('tour'):jobs.append((form,lg,team,rd))
 def one(job):
  form,lg,t,r=job;key=f"{lg['slug']}-{t['team_id']}-{r['round']}";dest=ROOT/'source'/'squads'/(key+'.json');dest.parent.mkdir(exist_ok=True)
  if dest.exists():
   previous=json.loads(dest.read_text('utf-8'))
   if os.environ.get('FRANCHISE_USE_CACHE')=='1' or previous.get('collected_finished'):return
  url=f"/analytics/fantasy_team_tour_data/{t['team_id']}/{r['tour']}/{lg['cid']}/"
  s=soup(get(url,{'ajax':1}));pl=[]
  for x in s.select('li[data-player_id]'):
   name=x.select_one('.uname');score=x.select_one('.score_wrapper > .score')
   value=score.get_text(' ',strip=True) if score else None
   if value=='' and {'finished','game_duration_0'}.issubset(set(score.get('class',[]))):value='0'
   pl.append({'id':x['data-player_id'],'sports_id':x.get('data-sport_player_internal_id'),'name':name.get_text(' ',strip=True) if name else '', 'class':x.get('class',[]),'club':x.get('title'),'score':value})
  d={'franchise':form['franchise'],'slug':lg['slug'],'cid':lg['cid'],'league_id':lg['league_id'],'manager':t['manager'],'team':t['team_id'],'round':r['round'],'url':BASE+url,'players':pl,'summary':s.get_text(' ',strip=True)[:280]}
  d['collected_finished']=settled(r)
  d['fetched_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
  dest.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 pool(one,jobs);print('squads',len(jobs))
def server():
 db('planning',"SELECT row_to_json(s) FROM (SELECT * FROM squad_planning_snapshots WHERE season='2026/2027' AND provider='SPORTS_RU' AND status='READY') s")
 db('current',"SELECT row_to_json(s) FROM (SELECT DISTINCT ON (league_id) * FROM fantasy_player_pool_snapshots WHERE season='2026/2027' AND provider='SPORTS_RU' ORDER BY league_id,calculated_at DESC) s")
 current=read_db('current');ids=','.join("'"+r['id']+"'" for r in current)
 db('current-players',f"SELECT row_to_json(s) FROM (SELECT snapshot_id,player_id,payload FROM fantasy_player_pool_snapshot_players WHERE snapshot_id IN ({ids})) s")
 db('foontasy',"SELECT row_to_json(s) FROM (SELECT * FROM foontasy_forecast_samples WHERE season='2026/2027' AND source_variant='sports') s")
 db('matches',"SELECT row_to_json(s) FROM (SELECT id,league_id,season,round,home_team_id,away_team_id,home_score,away_score,finished,cancelled,match_date FROM matches) s")
 db('stats',"SELECT row_to_json(s) FROM (SELECT p.*,m.match_date,m.league_id,m.season FROM match_player_stats p JOIN matches m ON m.id=p.match_id WHERE m.finished AND NOT m.cancelled) s")
 db('points',"SELECT row_to_json(s) FROM (SELECT * FROM fantasy_points) s")
 db('official-points',"SELECT row_to_json(s) FROM (SELECT * FROM fantasy_provider_player_match_scores WHERE provider='SPORTS_RU') s")
 db('price-mapping',"SELECT row_to_json(s) FROM (SELECT * FROM fantasy_player_prices WHERE season='2026/2027' AND provider='SPORTS_RU') s")
 db('rules',"SELECT row_to_json(s) FROM fantasy_rulesets s")
 db('players',"SELECT row_to_json(s) FROM players s")
 db('team-stats',"SELECT row_to_json(s) FROM (SELECT t.match_id,t.team_id,t.xg FROM match_team_stats t JOIN matches m ON m.id=t.match_id WHERE m.season='2026/2027' AND m.finished AND NOT m.cancelled) s")
 print('server snapshot complete')
if __name__=='__main__':
 if sys.argv[1]=='franchises':franchises()
 elif sys.argv[1]=='metadata':metadata()
 elif sys.argv[1]=='players':players()
 elif sys.argv[1]=='squads':squads()
 elif sys.argv[1]=='server':server()
