"""Read cached header/fixture identities only; no managers or squad payloads."""
import json
import pathlib
import subprocess

CODE = r'''
import collections,gzip,hashlib,json,pathlib
from bs4 import BeautifulSoup
root=pathlib.Path('/app/storage/franchises')
forms=json.loads((root/'franchise-teams.json').read_text())
output=[]
report=json.loads((root/'report-data.json').read_text())
missing_fid=next(r['franchise'] for r in report['squads'] if r.get('active') is None and not r.get('personal_only',False))
for fid,slug in [(433,'championship_2026'),(433,'ucl_2026'),(missing_fid,'championship_2026')]:
 for form in forms:
  if form.get('personal') or form['franchise']!=fid or form['slug']!=slug:continue
  cached=root/'source/http'/(hashlib.sha256(form['url'].encode()).hexdigest()+'.json.gz')
  soup=BeautifulSoup(json.loads(gzip.decompress(cached.read_bytes()))['body'],'html.parser')
  table=soup.select_one('.players_list table');header=table.select_one('tr.header')
  heads=[td for td in header.find_all('td',recursive=False) if td.select_one('a[href*="team_match_data"]')]
  rows=table.select('tbody tr[data-player_id]');columns=[]
  for j,hc in enumerate(heads):
   cells=[tr.select('td.match')[j] for tr in rows if len(tr.select('td.match'))>j]
   tours={a['data-tour_id'] for td in cells for a in td.select('a[data-tour_id]')}
   link=next((td.select_one('a.match_result[href]') for td in cells if td.select_one('a.match_result[href]')),None)
   sample={}
   active_link=next((td.select_one('a.match_result[href]') for td in cells if td.select_one('.game_number') and td.select_one('a.match_result[href]')),None)
   if active_link and j>=len(heads)-3:
    link=active_link
    url=link['href']+('?' if '?' not in link['href'] else '&')+'ajax=1'
    entry=root/'source/http'/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
    import urllib.request
    if entry.exists():body=json.loads(gzip.decompress(entry.read_bytes()))['body'];origin='cache'
    else:
     req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','X-Requested-With':'XMLHttpRequest'})
     with urllib.request.urlopen(req,timeout=10) as response:raw=response.read(8*1024*1024+1)
     if len(raw)>8*1024*1024:raise ValueError('Response too large')
     body=raw.decode('utf-8');origin='live-read-only'
    if body:
     value=json.loads(body) if body.lstrip().startswith('{') else {}
     doc=BeautifulSoup(value.get('data',{}).get('html','') if isinstance(value.get('data'),dict) else body,'html.parser')
     import re
     title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else ''
     sample={'origin':origin,'dates':re.findall(r'\d{2}\.\d{2}\.\d{4}',title),'fixture_links':sorted({a['href'] for a in doc.select('.roster.this_tour li:not(.prev) [href*="/football/match/"]')})}
   columns.append({'header':str(hc)[:1200],'tour_ids':sorted(tours),'sample':sample})
  vectors=[]
  for row in rows[:3]:
   vectors.append([{'tour_ids':sorted({a['data-tour_id'] for a in td.select('a[data-tour_id]')}),'matches':len(td.select('a.match_result')),'classes':td.get('class'),'board':td.select_one('.game_number').get_text() if td.select_one('.game_number') else None} for td in row.select('td.match')])
  boards=[]
  for column in columns[-3:]:
   hc=BeautifulSoup(column['header'],'html.parser');url=hc.select_one('a')['href']+'?ajax=1'
   entry=root/'source/http'/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
   if entry.exists():
    body=json.loads(gzip.decompress(entry.read_bytes()))['body'];value=json.loads(body) if body.lstrip().startswith('{') else {}
    html=value.get('data',{}).get('html','') if isinstance(value.get('data'),dict) else body
    doc=BeautifulSoup(html,'html.parser')
    import re
    boards.append({'url':url,'title':value.get('data',{}).get('title') if isinstance(value.get('data'),dict) else None,'date_text':re.findall(r'\d{2}\.\d{2}\.\d{4}',doc.get_text()),'tour_ids':sorted({a['data-tour_id'] for a in doc.select('[data-tour_id]')}),'fixture_links':sorted({a['href'] for a in doc.select('[href*="/football/match/"]')}),'column_count':len(doc.select('.one_tour_roster td.column'))})
  gaps=[]
  missing_teams={str(r['team']) for r in report['squads'] if r['franchise']==fid and r['slug']==slug and r.get('active') is None and not r.get('personal_only',False)}
  for row in rows:
   a=next((a for a in row.select('td.uname a[href]') if a['href'].rstrip('/').split('/')[-1].isdigit()),None)
   if a and a['href'].rstrip('/').split('/')[-1] in missing_teams:
    gaps.append({'match_cells':len(row.select('td.match')),'row_classes':row.get('class'),'cell_tours':[[a['data-tour_id'] for a in td.select('a[data-tour_id]')] for td in row.select('td.match')],'game_numbers':[td.select_one('.game_number').get_text() if td.select_one('.game_number') else None for td in row.select('td.match')]})
  output.append({'franchise':fid,'slug':slug,'form_url':form['url'],'columns':columns,'row_vectors':vectors,'board_metadata':boards,'missing_row_shapes':gaps})
print(json.dumps(output,ensure_ascii=False))
'''
result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', 'deploy',
                         'docker exec -i fantasy-scout-worker /opt/franchises/bin/python -'],
                        input=CODE, text=True, capture_output=True, timeout=45)
if result.returncode:
    raise SystemExit(result.stderr[-1000:])
data = json.loads(result.stdout)
pathlib.Path(__file__).with_name('board-identities-before.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(data, ensure_ascii=False, indent=2))
