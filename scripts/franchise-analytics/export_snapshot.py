"""Compact facts for bounded request-time aggregation. @spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
from analyze import ROOT,stream,clean,date_iso,date_ru,avg
from xfo import match_xfo,h2h_score
import json,gzip,collections,datetime as dt,os
import pandas as pd

def main():
 d=json.loads((ROOT/'report-data.json').read_text('utf-8'))
 if d.get('errors') or any(d['checks'].get(k,0) for k in ['future_history','duplicate_selections','missing_active_state']):raise ValueError('Source validation failed; retain the previous published snapshot')
 squads=pd.read_pickle(ROOT/'source/squad-metrics.pkl')
 decisions=pd.read_pickle(ROOT/'source/decisions.pkl')
 buys=pd.read_pickle(ROOT/'source/purchases.pkl')
 leagues=json.loads((ROOT/'leagues.json').read_text('utf-8'))
 mapping={(r['league_id'],str(r['provider_player_id'])):r for r in stream('price-mapping') if r['player_id']}
 matches={r['id']:r for r in stream('matches') if r['season']=='2026/2027' and r['finished'] and not r['cancelled']}
 txg={(r['match_id'],r['team_id']):r['xg'] for r in stream('team-stats')}
 playerids=set(int(x) for x in decisions.player_id.dropna())
 stats=collections.defaultdict(list)
 for r in stream('stats'):
  if r['player_id'] in playerids and r['match_id'] in matches:stats[r['player_id']].append(r)
 rounds={};roundids={}
 for l in leagues:
  for r in l['rounds']:
   dates=[date_ru(m['date']) for m in r['matches']]
   key=(l['slug'],r['round']);rounds[key]={'slug':l['slug'],'round':r['round'],'finished':bool(dates) and all(m['finished'] for m in r['matches']),'cutoff':min(dates).isoformat() if dates else None}
   # Match exact fixture start times, not a broad interval overlapping another round.
   roundids[key]={mid for mid,m in matches.items() if m['league_id']==l['league_id'] and any(abs((date_iso(m['match_date'])-x).total_seconds())<=900 for x in dates)}
 scores={}
 for path in (ROOT/'source/squads').glob('*.json'):
  s=json.loads(path.read_text('utf-8'))
  for p in s['players']:
   if 'prev' not in p['class']:scores[(s['slug'],s['round'],str(s['team']),str(p['id']))]=p.get('score')
 vals=[];filled_vals=[];player_examples=[];xcache={}
 for r in decisions.to_dict('records'):
  key=(r['slug'],r['round']);value=None;match_values=[];filled=False
  cachekey=(key,r.get('player_id'),r.get('pos'))
  if cachekey in xcache:value,filled=xcache[cachekey]
  elif pd.notna(r.get('player_id')):
   pid=int(r['player_id']);available=[s for s in stats.get(pid,[]) if s['match_id'] in roundids.get(key,set())]
   for s in available:
    m=matches[s['match_id']];opp=s.get('opponent_team_id') or (m['away_team_id'] if s.get('team_id')==m['home_team_id'] else m['home_team_id'])
    xga=txg.get((s['match_id'],opp));v=match_xfo(s,r.get('pos'),xga,excel_missing=True);match_values.append(v)
    if v is not None and match_xfo(s,r.get('pos'),xga) is None:filled=True
   # No match row means unknown, never an invented zero. Require all club fixtures in a double round.
   teams={s.get('team_id') for s in available}
   relevant=[matches[mid] for mid in roundids.get(key,set()) if matches[mid]['home_team_id'] in teams or matches[mid]['away_team_id'] in teams]
   if available and len(available)==len(relevant) and all(v is not None for v in match_values):value=sum(match_values)
   xcache[cachekey]=(value,filled)
  score=scores.get((r['slug'],r['round'],str(r['team']),str(r['h2h_id'])))
  actual=h2h_score(score,r['is_cap'],individual=True)
  vals.append(value);filled_vals.append(filled and value is not None)
  if r['is_xi'] and value is not None:
   player_examples.append({k:r[k] for k in ['franchise','manager','slug','round','team','name','is_cap','is_buy','source']}|{'xfo':value,'actual':actual,'filled':filled})
 decisions['xfo']=vals
 decisions['xfo_filled']=filled_vals
 xby={};xrows=[]
 for (fid,slug,rn,team),g in decisions[decisions.is_xi].groupby(['franchise','slug','round','team']):
  done=rounds.get((slug,rn),{}).get('finished',False);cap=g[g.is_cap];known=g.xfo.notna();full=bool(done and len(g)==11 and known.all() and len(cap)==1)
  xfo=float(g.xfo.sum()+cap.xfo.iloc[0]) if full else None
  actuals=[]
  for r in g.to_dict('records'):
   score=h2h_score(scores.get((slug,rn,str(team),str(r['h2h_id']))))
   if score is not None:actuals.append(score)
  actual=sum(actuals) if full and len(actuals)==11 else None
  x={'franchise':int(fid),'slug':slug,'round':int(rn),'team':str(team),'xfo':xfo,'xfo_actual':actual,'xfo_gap':actual-xfo if actual is not None else None,'xfo_known':int(known.sum()),'xfo_filled':int(g.xfo_filled.sum()),'xfo_complete':full and actual is not None,'finished':done,'xfo_player_mean':float(g.xfo.mean()) if known.any() else None}
  xrows.append(x);xby[(int(fid),slug,int(rn),str(team))]=x
 for r in d['squads']:r.update(xby.get((r['franchise'],r['slug'],r['round'],str(r['team'])),{}))
 for f in d['franchises']:
  rows=[r for r in d['squads'] if r['franchise']==f['franchise']];complete=[r for r in rows if r.get('xfo_complete')]
  balanced=lambda key:avg([avg([r[key] for r in complete if r['slug']==slug]) for slug in {r['slug'] for r in complete}])
  f['xfo_summary']={'complete':len(complete),'finished':sum(r['finished'] for r in rows),'known':sum(r['xfo_known'] for r in rows if r['finished']),'filled':sum(r['xfo_filled'] for r in rows if r['finished']),'slots':11*sum(r['finished'] for r in rows),'xfo':balanced('xfo'),'actual':balanced('xfo_actual'),'gap':balanced('xfo_gap')}
  f['xfo_examples']=[r for r in player_examples if r['franchise']==f['franchise']][:100]
 keep=['franchise','slug','round','team','manager','n_buy','active','frozen','own','own_gap','own_cohort_gap','diff_share','cap','cap_gap','rare_cap','buy_delta','buy_delta_gap','buy_form','buy_form_gap','buy_peak','buy_cold','fo_xi_pct','alt_xi_pct','ffo_xi_pct','fo_buy_pct','alt_buy_pct','ffo_buy_pct','triple_cap_disagree','current_fo','current_alt','current_ffo','xfo','xfo_actual','xfo_gap','xfo_known','xfo_complete','finished']
 keep.append('xfo_filled')
 # Examples are illustrative, not a second copy of every selected footballer.
 # Retain two distinct footballers per franchise/league/round, ordered by actual gap.
 example_groups=collections.defaultdict(list)
 for e in player_examples:
  if rounds[(e['slug'],e['round'])]['finished']:example_groups[(e['franchise'],e['slug'],e['round'])].append(e)
 compact_examples=[]
 for group in example_groups.values():
  seen_names=set()
  for e in sorted(group,key=lambda e:abs((e['actual'] or 0)-e['xfo']),reverse=True):
   if e['name'] in seen_names:continue
   compact_examples.append(e);seen_names.add(e['name'])
   if len(seen_names)==2:break
 freeze=json.loads((ROOT/'freezes.json').read_text('utf-8'))
 snapshot={'version':1,'season':'2026/2027','generated':dt.datetime.now(dt.timezone.utc).isoformat(),'acquisition':d['acquisition'],'franchises':[{'id':f['franchise'],'name':f['name']} for f in d['franchises']],'leagues':d['league_names'],'rounds':list(rounds.values()),'squads':[{k:r.get(k) for k in keep} for r in d['squads']],'freeze':{k:freeze[k] for k in ['events','basis']},'purchases':clean(buys[[c for c in ['franchise','manager','slug','round','team','h2h_id','name','pos','own','delta','form5','form5_gap','trend','minutes5','fdr_pre','fo','alt','ffo','triple_model_low','source','minutes_change','attack_change','underreturn','cold_with_followup','early_success','outcome_next3'] if c in buys]].to_dict('records')),'xfoExamples':player_examples,'checks':d['checks']}
 snapshot['xfoExamples']=compact_examples
 raw=json.dumps(clean(snapshot),ensure_ascii=False,separators=(',',':')).encode()
 if len(raw)>50*1024*1024:raise ValueError('Snapshot exceeds 50 MB bound')
 compressed=gzip.compress(raw,compresslevel=6)
 if len(compressed)>20*1024*1024:raise ValueError('Compressed snapshot exceeds 20 MB bound')
 tmp=ROOT/'snapshot.json.gz.tmp';tmp.write_bytes(compressed);os.replace(tmp,ROOT/'snapshot.json.gz')
 (ROOT/'report-data.json').write_text(json.dumps(clean(d),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print('Snapshot bytes',len(raw),'squads',len(xrows),'complete xFO',sum(r['xfo_complete'] for r in xrows),'known players',sum(r['xfo_known'] for r in xrows),flush=True)

if __name__=='__main__':main()
