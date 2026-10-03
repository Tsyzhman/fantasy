"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes"""
from research import *
from analyze import num,clean,date_ru
from sources import fixture_round
import collections
def main():
 forms=json.loads((ROOT/'franchise-teams.json').read_text('utf-8'));meta=json.loads((ROOT/'leagues.json').read_text('utf-8'));tourmap={r['tour']:(l['slug'],r['round']) for l in meta for r in l['rounds']};states=[];events=[];audit=[];base=[]
 fixtures={};dates=collections.defaultdict(set)
 for league in meta:
  for rd in league['rounds']:
   scope=(league['slug'],rd['round'])
   for match in rd['matches']:
    if match.get('sports_match_id'):fixtures[(league['slug'],str(match['sports_match_id']))]=scope
   if rd['matches']:
    date=(min(date_ru(m['date']) for m in rd['matches'])+datetime.timedelta(hours=3)).strftime('%d.%m.%Y')
    dates[(league['slug'],date)].add(scope)
 for form in forms:
  if form.get('personal'):continue
  s=soup(get(form['url']));table=s.select_one('.players_list table');header=table.select_one('tr.header');headcells=header.find_all('td',recursive=False);headers=[c for c in headcells if c.select_one('a[href*="team_match_data"]')];rows=table.select('tbody tr[data-player_id]')
  for j,hc in enumerate(headers):
   cells=[(tr,tr.select('td.match')[j]) for tr in rows if len(tr.select('td.match'))>j]
   tours={int(a['data-tour_id']) for tr,td in cells for a in td.select('a[data-tour_id]')}
   if len(tours)>1:audit.append({'form':form['url'],'j':j,'tours':list(tours)});continue
   scope=tourmap.get(next(iter(tours))) if tours else None
   if not tours:
    link=next((td.select_one('a.match_result[href]') for tr,td in cells if td.select_one('a.match_result[href]')),None)
    if link:
     body=get(link['href'],{'ajax':1});value=json.loads(body) if body.lstrip().startswith('{') else {}
     title=value.get('data',{}).get('title','') if isinstance(value.get('data'),dict) else ''
     scope=fixture_round(soup(body),form['slug'],fixtures,dates,title)
   if not scope:audit.append({'form':form['url'],'j':j,'tours':list(tours)});continue
   slug,rn=scope;entries=[]
   for tr,cell in cells:
    a=next((a for a in tr.select('td.uname a[href]') if a['href'].rstrip('/').split('/')[-1].isdigit()),None)
    if not a:continue
    link=cell.select_one('a.match_result');active=cell.select_one('.game_number') is not None;frozen='exchange' in cell.get('class',[]);score=None;opp=None
    if link:
     if link.get('data-score'):
      parts=link['data-score'].split(' - ');score=num(parts[0]);opp=num(parts[1])
     else:score=num(link.get_text(' ',strip=True))
    e={'franchise':form['franchise'],'slug':slug,'round':rn,'manager':a.get_text(' ',strip=True),'team':a['href'].rstrip('/').split('/')[-1],'active':active,'frozen':frozen,'score':score,'opponent_score':opp,'board':int(cell.select_one('.game_number').text) if active else None,'finished':bool(link and 'finished' in link.get('class',[])),'source':hc.select_one('a')['href']}
    entries.append(e);states.append(e)
   active=sorted([e for e in entries if e['active']],key=lambda e:e['board']);frozen=[e for e in entries if e['frozen']];base.append({'franchise':form['franchise'],'slug':slug,'round':rn,'n_active':len(active),'n_frozen':len(frozen)})
   if frozen:
    k=len(frozen);subs=active[-k:];valid=len(active)==6 and len(subs)==k and all(e['score'] is not None for e in frozen+subs);finished=all(e['finished'] for e in active)
    event={'franchise':form['franchise'],'slug':slug,'round':rn,'frozen':frozen,'substitutes':subs,'n':k,'valid':valid,'finished':finished,'source':hc.select_one('a')['href'],'gain':sum(e['score'] for e in subs)-sum(e['score'] for e in frozen) if valid else None,'sub_wins':sum(e['score']>e['opponent_score'] for e in subs if e['score'] is not None and e['opponent_score'] is not None),'sub_ties':sum(e['score']==e['opponent_score'] for e in subs if e['score'] is not None and e['opponent_score'] is not None),'active_scores':[e['score'] for e in active]}
    events.append(event)
 # Verify each replacement interpretation against the actual board order.
 def verify(event):
  s=soup(get(event['source'],{'ajax':1}));wanted={e['team'] for e in event['substitutes']};matched=None
  for col in s.select('.one_tour_roster td.column'):
   teams=[]
   for li in col.select('.roster li'):
    a=li.select_one('a.uname[href]')
    if a and 'reserve' not in li.get('class',[]):teams.append(a['href'].rstrip('/').split('/')[-1])
   if wanted.issubset(set(teams)):matched=teams
  # The live summary can briefly omit the sixth board. The actual board is authoritative.
  if matched and len(matched)==6:
   owncol=next(col for col in s.select('.one_tour_roster td.column') if any(a['href'].rstrip('/').split('/')[-1]==matched[0] for a in col.select('a.uname[href]')))
   other=next(col for col in s.select('.one_tour_roster td.column') if col is not owncol)
   opponents=[num(li.select_one('.score').text) for li in other.select('.roster li') if 'reserve' not in li.get('class',[])]
   ss=[e for e in states if (e['franchise'],e['slug'],e['round'])==(event['franchise'],event['slug'],event['round'])]
   byid={e['team']:e for e in ss}
   for li in owncol.select('.roster li'):
    a=li.select_one('a.uname[href]');tid=a['href'].rstrip('/').split('/')[-1] if a else None
    if tid not in byid:continue
    e=byid[tid];e['active']=tid in matched;e['board']=matched.index(tid)+1 if tid in matched else None;e['score']=num(li.select_one('.score').text)
    e['opponent_score']=opponents[e['board']-1] if e['board'] and e['board']<=len(opponents) else None
   event['substitutes']=[byid[tid] for tid in matched[-event['n']:]]
   event['valid']=all(e['score'] is not None for e in event['substitutes']+event['frozen'])
   event['gain']=sum(e['score'] for e in event['substitutes'])-sum(e['score'] for e in event['frozen']) if event['valid'] else None
   event['sub_wins']=sum(e['score']>e['opponent_score'] for e in event['substitutes'] if e['opponent_score'] is not None)
   event['sub_ties']=sum(e['score']==e['opponent_score'] for e in event['substitutes'] if e['opponent_score'] is not None)
   event['active_scores']=[byid[tid]['score'] for tid in matched]
   event['board_verified']=True
  else:event['board_verified']=False
  return event
 events=pool(verify,events)
 summary=[]
 for fid in IDS:
  ev=[e for e in events if e['franchise']==fid];valid=[e for e in ev if e['finished'] and e['valid'] and e['board_verified']];bb=[e for e in base if e['franchise']==fid and e['n_active']>=5]
  people=collections.Counter(e['manager'] for v in ev for e in v['frozen'])
  summary.append({'franchise':fid,'team_rounds':len(bb),'episodes':len(ev),'frozen_slots':sum(e['n'] for e in ev),'frequency':len(ev)/len(bb)*100 if bb else None,'completed':len(valid),'pending':len(ev)-len(valid),'gain':sum(e['gain'] for e in valid),'mean_gain':sum(e['gain'] for e in valid)/len(valid) if valid else None,'success_rate':sum(e['gain']>0 for e in valid)/len(valid)*100 if valid else None,'positive':sum(e['gain']>0 for e in valid),'negative':sum(e['gain']<0 for e in valid),'neutral':sum(e['gain']==0 for e in valid),'sub_wins':sum(e['sub_wins'] for e in valid),'sub_duels':sum(e['n'] for e in valid),'most_frozen':dict(people.most_common()),'by_league':[{'slug':l['slug'],'episodes':sum(e['slug']==l['slug'] for e in ev),'gain':sum(e['gain'] for e in valid if e['slug']==l['slug'])} for l in meta]})
 save('freezes.json',clean({'states':states,'events':events,'summary':summary,'audit':audit,'basis':base}))
 print('FREEZES',len(states),len(events),sum(e['n'] for e in events),'verified',sum(e['board_verified'] for e in events),'audit',audit)
 print('EXAMPLE',[e for e in events if e['franchise']==5 and e['slug']=='eredivisie_2026' and e['round']==7]);print('SUMMARY',summary)
if __name__=='__main__':main()
