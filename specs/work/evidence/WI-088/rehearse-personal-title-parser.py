"""Read-only parser rehearsal of every personal response in the failed 151 run.

Exact candidate AST; serving-image parser is the comparison. No collector,
database, imports of application modules, source writes or network access.
@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts
"""
import ast
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
source = (ROOT / 'scripts/franchise-analytics/sources.py').read_bytes()
tree = ast.parse(source.decode('utf-8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'personal_teams')
candidate = ast.get_source_segment(source.decode('utf-8'), function)

CODE = r'''
import ast,collections,datetime as dt,gzip,hashlib,json,pathlib,re,resource,time,urllib.parse
from bs4 import BeautifulSoup
root=pathlib.Path('/app/storage/franchises');cutoff=dt.datetime(2026,11,4,14,57,10,tzinfo=dt.timezone.utc);started=time.monotonic()
leagues={'rfpl_2026':63,'portugal_2026':61,'eredivisie_2026':57,'championship_2026':48,'turkey_2026':71,'la_liga_2026':87,'epl_2026':47,'seria_a_2026':55,'france_2026':53,'bundesliga_2026':54,'ucl_2026':42,'liga_europa_2026':73,'fnl_2026':None,'khl_2026':None,'nhl_2026':None}
serving=pathlib.Path('/app/scripts/franchise-analytics/sources.py').read_bytes();tree=ast.parse(serving.decode());node=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='personal_teams');old_code=ast.get_source_segment(serving.decode(),node)
old_ns={'re':re,'urllib':__import__('urllib')};new_ns=dict(old_ns);exec(old_code,old_ns);exec(CANDIDATE,new_ns);old=old_ns['personal_teams'];new=new_ns['personal_teams']
for name in ['board_user_id','profile_path']:
 helper=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name==name);exec(ast.get_source_segment(serving.decode(),helper),old_ns)
snapshots={};snapshot_bytes=0
for path in (root/'source/http').glob('*.json.gz'):
 if path.stat().st_mtime<cutoff.timestamp()-5:continue
 raw=path.read_bytes()
 with gzip.open(path,'rb') as stream:uncompressed=stream.read(8*1024**2+1)
 assert len(uncompressed)<=8*1024**2,'Oversized cache envelope'
 value=json.loads(uncompressed);url=value.get('url','')
 fetched=dt.datetime.fromisoformat(value['fetchedAt'].replace('Z','+00:00'))
 if fetched<cutoff:continue
 assert path.name==hashlib.sha256(url.encode()).hexdigest()+'.json.gz','Unexpected HTTP cache identity'
 snapshots[url]=(path.name,value['fetchedAt'],hashlib.sha256(raw).hexdigest(),raw);snapshot_bytes+=len(raw)
 assert snapshot_bytes<=128*1024**2,'Compressed diagnostic input exceeds 128 MiB bound'
def document(url):
 assert url in snapshots,('Missing fresh primary context source',url)
 value=json.loads(gzip.decompress(snapshots[url][3]));body=value['body']
 if body.lstrip().startswith('{'):
  payload=json.loads(body);body=payload.get('data') or payload.get('html') or ''
  if isinstance(body,dict):body=body.get('html','')
 return BeautifulSoup(body,'html.parser')
pages=[]
for url,item in snapshots.items():
 match=re.fullmatch(r'https://fantasy-h2h.ru/h2h/user_tournaments_list/(\d+)/26\?ajax=1',url)
 if match:pages.append((match[1],url,item))
assert pages,'No current personal responses'
assert len({x[0] for x in pages})==len(pages),'Duplicate personal response URL'
print(json.dumps({'type':'inventory','personal_pages':len(pages),'snapshot_cache_entries':len(snapshots),'snapshot_compressed_bytes':snapshot_bytes,'elapsed_seconds':round(time.monotonic()-started,2)}),flush=True)
# Reconstruct the submitted UID population from the same fresh franchise,
# board-form and profile source links. Do not use the stale saved forms file.
registry=json.loads(pathlib.Path('/app/scripts/franchise-analytics/franchises.json').read_text());form_urls=[];profiles=set();expected_uids=set();board_uids=set();profile_uids=set()
for group in registry['groups']:
 for user in group['users']:profiles.add('https://fantasy-h2h.ru'+old_ns['profile_path'](user['profile']))
for number,fid in enumerate(registry['franchises'],1):
 doc=document('https://fantasy-h2h.ru/franchise/view/'+str(fid))
 for div in doc.select('[id^="fnts_tournaments_list_26_"][id$="_content"]'):
  match=re.search(r'_26_(\d+)_',div['id'])
  if not match:continue
  anchor=div.select_one('a[data-url]')
  if anchor is not None and any(value is not None and anchor.get('data-name','').startswith(slug) for slug,value in leagues.items()):form_urls.append(anchor['data-url'])
 for anchor in doc.select('table[id^="franchise_roster"] a.cu_name'):profiles.add('https://fantasy-h2h.ru'+old_ns['profile_path'](anchor['href']))
 doc.decompose()
 if number%20==0:print(json.dumps({'type':'source_context','franchises_checked':number}),flush=True)
for number,url in enumerate(dict.fromkeys(form_urls),1):
 doc=document(url)
 for row in doc.select('.players_list tbody tr'):
  anchor=next((a for a in row.select('td.uname a[href]') if a['href'].rstrip('/').split('/')[-1].isdigit()),None)
  if anchor is not None:
   uid=old_ns['board_user_id'](row)
   if uid:board_uids.add(uid)
 doc.decompose()
 if number%100==0:print(json.dumps({'type':'source_context','form_pages_checked':number}),flush=True)
for number,url in enumerate(sorted(profiles),1):
 doc=document(url);uid=next((match[1] for anchor in doc.select('a[data-url]') if (match:=re.fullmatch(r'https://fantasy-h2h.ru/h2h/user_tournaments_list/(\d+)',anchor.get('data-url','')))),None)
 assert uid is not None,('Fresh profile has no personal history identity',url)
 profile_uids.add(uid);doc.decompose()
 if number%100==0:print(json.dumps({'type':'source_context','profile_pages_checked':number}),flush=True)
expected_uids=board_uids|profile_uids;actual_uids={x[0] for x in pages};missing_uids=sorted(expected_uids-actual_uids);extra_uids=sorted(actual_uids-expected_uids)
assert not missing_uids,('Missing submitted personal user responses',missing_uids[:20])
source_context={'franchise_pages':len(registry['franchises']),'form_jobs':len(form_urls),'unique_form_urls':len(set(form_urls)),'profile_jobs':len(profiles),'unique_board_uids':len(board_uids),'unique_profile_uids':len(profile_uids),'expected_submitted_uids':len(expected_uids),'missing_submitted_uids':missing_uids,'extra_personal_uids':extra_uids,'expected_uid_set_sha256':hashlib.sha256(json.dumps(sorted(expected_uids),separators=(',',':')).encode()).hexdigest()}
print(json.dumps({'type':'coverage','source_context':source_context,'personal_pages':len(pages),'elapsed_seconds':round(time.monotonic()-started,2)}),flush=True)
old_errors=[];new_errors=[];changed_old_success=[];total_teams=total_rounds=old_success=0;unique=set();short=collections.Counter();example=None;before=[]
for number,(uid,url,(filename,fetched,expected_hash,raw)) in enumerate(sorted(pages),1):
 assert hashlib.sha256(raw).hexdigest()==expected_hash
 doc=document(url);normalized=str(doc)
 # This is the exact soup(get(...)) -> str(...) boundary used by research.py.
 for link in doc.select('a[href*="fantasy_score_dynamic/"]'):
  identity=re.fullmatch(r'/analytics/fantasy_score_dynamic/([^/]+)/id(\d+)',urllib.parse.urlsplit(link['href']).path)
  if not identity or leagues.get(identity[1]) is None:continue
  container=link.find_parent('div',class_='data')
  if container is None:continue
  for score in container.select('a[href*="fantasy_team_tour_data/"]'):
   title=re.fullmatch(r'тур (\d+)',score.get('title',''))
   if title:short[(identity[1],int(title[1]),'in_progress' in score.get('class',[]),score.get('data-tour_id'))]+=1
 try:old_value=old(normalized,leagues)
 except Exception as error:old_errors.append({'uid':uid,'error':str(error)});old_value=None
 try:new_value=new(normalized,leagues)
 except Exception as error:new_errors.append({'uid':uid,'error':str(error)});new_value=None
 if old_value is not None:
  old_success+=1
  if old_value!=new_value:changed_old_success.append(uid)
 if new_value is not None:
  total_teams+=len(new_value);total_rounds+=sum(len(x['available_rounds']) for x in new_value)
  for team in new_value:
   for rn in team['available_rounds']:unique.add((team['slug'],team['cid'],team['team_id'],rn))
 if uid=='1101905285':example={'uid':uid,'teams':len(new_value) if new_value is not None else None,'rounds':sum(len(x['available_rounds']) for x in new_value) if new_value is not None else None,'liga_europa':[x for x in new_value or [] if x['slug']=='liga_europa_2026']}
 assert hashlib.sha256(raw).hexdigest()==expected_hash,'Private immutable input mutated'
 before.append((filename,fetched,expected_hash));doc.decompose()
 if number%40==0 or number==len(pages):print(json.dumps({'type':'progress','checked':number,'total':len(pages),'candidate_errors':len(new_errors),'old_parser_errors':len(old_errors),'elapsed_seconds':round(time.monotonic()-started,2)}),flush=True)
after=[(filename,fetched,hashlib.sha256(raw).hexdigest()) for uid,url,(filename,fetched,expected_hash,raw) in sorted(pages)]
assert before==after,'Private input snapshot changed during rehearsal'
changed_live_files=[]
for uid,url,(filename,fetched,expected_hash,raw) in sorted(pages):
 path=root/'source/http'/filename
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected_hash:changed_live_files.append(uid)
assert not new_errors,('Candidate parser errors',new_errors[:10])
assert not changed_old_success,('Changed formerly-valid outputs',changed_old_success[:10])
assert example and example['teams']==12 and example['rounds']==111 and example['liga_europa']==[{'slug':'liga_europa_2026','cid':349,'team_id':'641000','available_rounds':[1,2,3,4]}],example
print(json.dumps({'type':'result','personal_pages':len(pages),'unique_users':len({x[0] for x in pages}),'source_context':source_context,'candidate_successes':len(pages)-len(new_errors),'candidate_errors':new_errors,'old_parser_successes':old_success,'old_parser_errors':old_errors,'formerly_valid_output_changes':changed_old_success,'team_histories_retained':total_teams,'personal_team_rounds_retained':total_rounds,'unique_source_team_rounds':len(unique),'short_title_scopes':[{'slug':key[0],'round':key[1],'in_progress':key[2],'data_tour_id':key[3],'links':count} for key,count in sorted(short.items(),key=lambda item:str(item[0]))],'concrete_profile':example,'private_input_snapshot_sha256':hashlib.sha256(json.dumps(before,separators=(',',':')).encode()).hexdigest(),'immutable_input_hashes_unchanged':before==after,'live_cache_changed_by_other_process_count':len(changed_live_files),'live_cache_changed_uids':changed_live_files,'snapshot_compressed_bytes':snapshot_bytes,'serving_sources_sha256':hashlib.sha256(serving).hexdigest(),'serving_parser_sha256':hashlib.sha256(old_code.encode()).hexdigest(),'candidate_parser_sha256':hashlib.sha256(CANDIDATE.encode()).hexdigest(),'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'cgroup_events':pathlib.Path('/sys/fs/cgroup/memory.events').read_text(),'elapsed_seconds':round(time.monotonic()-started,3),'network_used':False,'source_cache_written':False,'collector_or_aggregate_or_import_run':False},ensure_ascii=False),flush=True)
'''.replace('exec(CANDIDATE,', 'exec(' + repr(candidate) + ',').replace('hashlib.sha256(CANDIDATE.encode())', 'hashlib.sha256(' + repr(candidate) + '.encode())')

REMOTE = r'''
import json,pathlib,subprocess
available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'));assert available>=2*1024**3
worker=json.loads(subprocess.check_output(['docker','inspect','fantasy-scout-worker'],text=True,timeout=10))[0];env=dict(v.split('=',1) for v in worker['Config']['Env'] if '=' in v);assert env.get('APP_RELEASE_COMMIT')=='d31ca192f80467bc7cd611b688c3047d45545c5b'
assert worker['Image']=='sha256:27ad0032b39975674757e0f536bd0ff320d28f2f34b2b5070fabe7acdaade9dd'
mount=next(m for m in worker['Mounts'] if m['Destination']=='/app/storage/franchises');name='fantasy-scout-personal-parser-rehearsal-wi088'
configuration={'available_before_bytes':available,'image':worker['Image'],'commit':env['APP_RELEASE_COMMIT'],'source_readonly':True,'root_readonly':True,'network':'none','memory_bytes':1024**3,'memory_swap_bytes':1024**3,'cpus':1,'timeout_seconds':480}
print(json.dumps({'type':'configuration','configuration':configuration}),flush=True)
args=['docker','run','--rm','--init','-i','--name',name,'--read-only','--user','1000:1000','--network','none','--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--no-healthcheck','--env','PYTHONDONTWRITEBYTECODE=1','--mount',f"type=volume,src={mount['Name']},dst=/app/storage/franchises,readonly",worker['Image'],'timeout','--signal=TERM','--kill-after=5','480','/opt/franchises/bin/python','-']
proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1);proc.stdin.write(CODE);proc.stdin.close()
for line in proc.stdout:print(line,end='',flush=True)
code=proc.wait();remaining=subprocess.check_output(['docker','ps','-aq','--filter','name=^/'+name+'$'],text=True,timeout=10).strip();available_after=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
print(json.dumps({'type':'completion','diagnostic_exit':code,'remaining_container':remaining,'available_after_bytes':available_after}),flush=True)
raise SystemExit(code)
'''.replace('proc.stdin.write(CODE)', 'proc.stdin.write(' + repr(CODE) + ')')

if __name__ == '__main__':
    proc = subprocess.Popen(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3', 'deploy', 'python3 -'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', bufsize=1)
    proc.stdin.write(REMOTE);proc.stdin.close()
    records, other = [], []
    for line in proc.stdout:
        try:
            record = json.loads(line);records.append(record)
            preview = record if record.get('type') != 'result' else {**{key: value for key, value in record.items() if key != 'old_parser_errors'}, 'old_parser_error_count': len(record['old_parser_errors'])}
            print(json.dumps(preview, ensure_ascii=True), flush=True)
        except ValueError:
            other.append(line);print(line, end='', flush=True)
    code = proc.wait()
    receipt = {'candidate_sources_sha256': hashlib.sha256(source).hexdigest(), 'candidate_parser_sha256': hashlib.sha256(candidate.encode()).hexdigest(), 'records': records, 'other_output': other, 'ssh_exit': code}
    pathlib.Path(__file__).with_name('personal-title-parser-rehearsal-0151.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sys.exit(code)
