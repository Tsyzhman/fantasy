"""Pre-round features. @spec spec://modules/franchises/FEAT-005-franchise-analytics#time"""
from research import ROOT,save,read_db,IDS
from sources import read_squads
import json,gzip,collections,datetime as dt,bisect,math,sys,statistics,hashlib
import numpy as np
import pandas as pd
from scipy.stats import rankdata,spearmanr
MONTHS={'Янв':1,'Фев':2,'Мар':3,'Апр':4,'Мая':5,'Май':5,'Июн':6,'Июл':7,'Авг':8,'Сен':9,'Окт':10,'Ноя':11,'Дек':12}
def date_ru(s):
 a=s.replace(',','').split();h,m=map(int,a[3].split(':'));return dt.datetime(int(a[2]),MONTHS[a[1]],int(a[0]),h,m)-dt.timedelta(hours=3)
def date_iso(s):return dt.datetime.fromisoformat(s.replace('Z','')).replace(tzinfo=None) if s else None
def num(x):
 try:return float(str(x).replace(',','.').replace('−','-'))
 except:return None
def avg(vals):
 a=[x for x in vals if x is not None and math.isfinite(x)];return float(np.mean(a)) if a else None
def weighted(vals,weights):
 a=[(v,w) for v,w in zip(vals,weights) if v is not None and math.isfinite(v) and w>0]
 return sum(v*w for v,w in a)/sum(w for _,w in a) if a else None
def stream(name):
 with gzip.open(ROOT/'source'/(name+'.jsonl.gz'),'rt',encoding='utf-8') as f:
  for line in f:
   if line.strip():yield json.loads(line)
POS={'GK':'Вр','DEF':'Зщ','MID':'Пз','FWD':'Нп','1':'Вр','2':'Зщ','3':'Пз','4':'Нп'}
def percentiles(pool,field):
 out={}
 for pos in ['Вр','Зщ','Пз','Нп']:
  vals=[(str(pid),p.get(field)) for pid,p in pool.items() if POS.get(str(p.get('position')),p.get('position'))==pos and p.get(field) is not None]
  if vals:
   ranks=rankdata([v for _,v in vals],method='average')/len(vals)*100
   out.update({pid:float(v) for (pid,_),v in zip(vals,ranks)})
 return out
def features():
 leagues=json.loads((ROOT/'leagues.json').read_text('utf-8'));mapping={(r['league_id'],str(r['provider_player_id'])):r for r in stream('price-mapping') if r['player_id']}
 pts={(r['match_id'],r['player_id']):r['points'] for r in stream('points') if r['ruleset_id']==1}
 relevant={r['player_id'] for r in mapping.values()};hist=collections.defaultdict(list);duplicates=0;seen=set();total=0;used=0;seasons=collections.Counter()
 for r in stream('stats'):
  total+=1
  if r['player_id'] not in relevant:continue
  key=(r['match_id'],r['player_id'])
  if key in seen:duplicates+=1;continue
  seen.add(key);date=date_iso(r['match_date'])
  if not date or (r['minutes'] or 0)<=0:continue
  hist[r['player_id']].append({'date':date,'match_id':r['match_id'],'fp':pts.get(key),'minutes':r['minutes'],'xg':r['xg'],'xa':r['xa'],'goals':r['goals'],'assists':r['assists'],'recoveries':r['recoveries'],'team_id':r['team_id'],'league_id':r['league_id']});used+=1;seasons[r['season']]+=1
 del pts,seen
 dates={}
 for pid,h in hist.items():h.sort(key=lambda x:(x['date'],x['match_id']));dates[pid]=[x['date'] for x in h]
 snaps={};snapmeta=[];invalid=0;forecastdates=[]
 fields=['playerId','providerPlayerId','name','price','position','teamName','predictedFp','alternativePredictedFp','foontasyPoints','expectedMinutes','startProbability','forecastModelVersion','forecastCalculatedAt','foontasyFetchedAt','forecastDataUpdatedAt','fixtures','fixtureDifficulties','rotationRisk','projectionListMetrics']
 for r in stream('planning'):
  cutoff=date_iso(r['first_kickoff_at']);capt=date_iso(r['captured_at']);rn=int(r['round_key'].split(':')[2]);key=(r['league_id'],rn)
  if capt>cutoff:invalid+=1;continue
  pmap={}
  for p in r['players']:
   p={k:p.get(k) for k in fields}
   if date_iso(p.get('forecastCalculatedAt')) and date_iso(p['forecastCalculatedAt'])>cutoff:
    p['predictedFp']=None;p['alternativePredictedFp']=None;invalid+=1
   if date_iso(p.get('foontasyFetchedAt')) and date_iso(p['foontasyFetchedAt'])>cutoff:p['foontasyPoints']=None
   pmap[str(p['playerId'])]=p
  snaps[key]=pmap;snapmeta.append({k:r[k] for k in ['league_id','round_key','first_kickoff_at','captured_at','players_count']})
 ffo={};ffopools=collections.defaultdict(dict);ffodup=0
 for r in stream('foontasy'):
  if r['player_id']:
   k=(r['league_id'],r['round_number'],str(r['source_player_id']))
   if k in ffo:ffodup+=1
   ffo[k]={'value':r['foontasy_points'],'at':r['captured_at'],'source_round':r['source_round_number']}
   ffopools[k[:2]][k[2]]={'position':r['position'],'ffo':r['foontasy_points'],'at':r['captured_at']}
 currmeta=read_db('current');snapleague={r['id']:r['league_id'] for r in currmeta};current=collections.defaultdict(dict)
 for r in stream('current-players'):
  p=r['payload'];current[snapleague[r['snapshot_id']]][str(p['playerId'])]={k:p.get(k) for k in fields}
 sports={};names={};badlinks=[]
 for f in (ROOT/'source/squads').glob('*.json'):
  d=json.loads(f.read_text('utf-8'))
  for p in d['players']:
   k=(d['slug'],p['id']);val=p.get('sports_id')
   if k in sports and sports[k]!=val:badlinks.append([k,sports[k],val])
   sports[k]=val;names[k]=p['name']
 rows=[];round_meta=[]
 for lg in leagues:
  for rd in lg['rounds']:
   cutoff=min(date_ru(m['date']) for m in rd['matches']);key=(lg['league_id'],rd['round']);snap=snaps.get(key,{})
   pct={c:percentiles(snap,f) for c,f in [('fo','predictedFp'),('alt','alternativePredictedFp'),('ffo','foontasyPoints')]}
   fpool={pid:v for pid,v in ffopools.get(key,{}).items() if date_iso(v['at'])<cutoff}
   fpct=percentiles(fpool,'ffo')
   if snap:
    sm=next(x for x in snapmeta if x['league_id']==key[0] and int(x['round_key'].split(':')[2])==key[1])
    if date_iso(sm['first_kickoff_at'])!=cutoff:raise ValueError(('deadline mismatch',key,cutoff,sm))
   site=json.loads((ROOT/'source'/f"players-{lg['slug']}-{rd['round']}.json").read_text('utf-8'));assert len({x['id'] for x in site})==len(site)
   for p in site:
    sid=sports.get((lg['slug'],p['id']));mp=mapping.get((lg['league_id'],sid));pid=mp['player_id'] if mp else None
    row={'slug':lg['slug'],'league_id':lg['league_id'],'round':rd['round'],'h2h_id':p['id'],'sports_id':sid,'player_id':pid,'name':p['name'],'club':p['sport_team_id'],'pos':p['amplua_id'],'cutoff':cutoff.isoformat(),'own':num(p['popularity_h2h']),'own_global':num(p['popularity']),'cap':num(p['popularity_captain']),'delta':num(p['popularity_h2h_delta']) or 0,'buy_weight':max(num(p['popularity_h2h_delta']) or 0,0),'mapped':pid is not None}
    if pid:
     # A three-hour guard approximates match completion when only kickoff exists.
     end=bisect.bisect_left(dates.get(pid,[]),cutoff-dt.timedelta(hours=3));history=hist.get(pid,[])[:end];last=history[-10:];last5=last[-5:];last3=last[-3:]
     fp5=[x['fp'] for x in last5 if x['fp'] is not None];fp3=[x['fp'] for x in last3 if x['fp'] is not None];prior=[x['fp'] for x in last[:-3] if x['fp'] is not None]
     row.update({'form_n':len(fp5),'form5':avg(fp5) if len(fp5)>=3 else None,'form3':avg(fp3) if len(fp3)>=3 else None,'prior7':avg(prior) if len(prior)>=3 else None,'trend':avg(fp3)-avg(prior) if len(fp3)>=3 and len(prior)>=3 else None,'minutes5':avg([x['minutes'] for x in last5]) if len(last5)>=3 else None,'goals5':sum((x['goals'] or 0) for x in last5),'history_n':len(history),'last_history_date':last[-1]['date'].isoformat() if last else None,'history_matches':[x['match_id'] for x in last]})
     xhist=[x for x in last5 if x['xg'] is not None and x['xa'] is not None and x['minutes']];row['xgi90']=sum(x['xg']+x['xa'] for x in xhist)/sum(x['minutes'] for x in xhist)*90 if len(xhist)>=3 else None
     future=[x for x in hist.get(pid,[]) if cutoff<=x['date']<=cutoff+dt.timedelta(days=35)][:3]
     futurefp=[x['fp'] for x in future if x['fp'] is not None]
     row['outcome_next3']=avg(futurefp) if len(futurefp)==3 else None
     row['outcome_n']=len(futurefp)
     pr=snap.get(str(pid),{});f=ffo.get((*key,str(sid)))
     row.update({'fo':pr.get('predictedFp'),'alt':pr.get('alternativePredictedFp'),'ffo':pr.get('foontasyPoints'),'price_pre':pr.get('price'),'minutes_pre':pr.get('expectedMinutes'),'fixture_pre':pr.get('fixtures',[None])[0] if pr.get('fixtures') else None,'fdr_pre':pr.get('fixtureDifficulties',[None])[0] if pr.get('fixtureDifficulties') else None,'snapshot_pre':bool(pr),'model_version':pr.get('forecastModelVersion')})
     if row['ffo'] is None and f and date_iso(f['at'])<cutoff:row['ffo']=f['value']
     for c in ['fo','alt','ffo']:row[c+'_pct']=pct[c].get(str(pid)) if c!='ffo' or str(pid) in pct[c] else fpct.get(str(sid))
     cp=current[lg['league_id']].get(str(pid),{});row.update({'current_fo':cp.get('predictedFp'),'current_alt':cp.get('alternativePredictedFp'),'current_ffo':cp.get('foontasyPoints')})
    rows.append(row)
   round_meta.append({'slug':lg['slug'],'round':rd['round'],'cutoff':cutoff.isoformat(),'players':len(site),'all_matches_finished':all(m['finished'] for m in rd['matches']),'snapshot':bool(snap),'field_own_sum':sum(num(x['popularity_h2h']) or 0 for x in site),'field_cap_sum':sum(num(x['popularity_captain']) or 0 for x in site)})
 df=pd.DataFrame(rows)
 for col in ['form5','trend','xgi90','minutes5']:
  df[col+'_pct']=df.groupby(['slug','round','pos'])[col].rank(pct=True)*100
 df.to_pickle(ROOT/'source/features.pkl')
 save('source-audit.json',{'stats_total':total,'stats_relevant':used,'stats_duplicates':duplicates,'stats_seasons':dict(seasons),'mapping_conflicts':badlinks,'invalid_forecasts':invalid,'ffo_duplicate_mappings':ffodup,'server_snapshots':snapmeta,'current_snapshots':[{k:r[k] for k in ['league_id','calculated_at','revision','players_count']} for r in currmeta],'rounds':round_meta,'features':len(df),'mapped_features':int(df.mapped.sum())})
 print('FEATURES',df.shape,'mapped',df.mapped.sum(),'form',df.form5.notna().sum(),'FO',df.fo.notna().sum(),'ALT',df.alt.notna().sum(),'FFO',df.ffo.notna().sum(),flush=True)
def clean(obj):
 if obj is pd.NA:return None
 if isinstance(obj,dict):return {k:clean(v) for k,v in obj.items()}
 if isinstance(obj,(list,tuple)):return [clean(v) for v in obj]
 if isinstance(obj,(np.integer,)):return int(obj)
 if isinstance(obj,(float,np.floating)):return float(obj) if math.isfinite(obj) else None
 if isinstance(obj,(np.bool_,)):return bool(obj)
 return obj
def aggregate():
 f=pd.read_pickle(ROOT/'source/features.pkl');lookup={(r['slug'],r['round'],r['h2h_id']):r for r in f.to_dict('records')};audit=json.loads((ROOT/'source-audit.json').read_text('utf-8'));franchises=json.loads((ROOT/'franchises.json').read_text('utf-8'))
 freeze=json.loads((ROOT/'freezes.json').read_text('utf-8'));state={(x['franchise'],x['slug'],x['round'],x['team']):x for x in freeze['states']}
 fields={};rounds={}
 for (slug,rn),g in f.groupby(['slug','round']):
  weights=g.buy_weight.to_numpy();d={'own_bench':weighted(g.own,g.own),'cap_bench':weighted(g.cap,g.cap),'modal_cap':g.cap.max(),'buy_delta_bench':weighted(g.delta,weights),'buy_weight_total':sum(weights),'pos_own':{},'pos_form':{}}
  for col in ['form5','form3','trend','xgi90','minutes5','fo','alt','ffo']:
   vals=g[col];ok=vals.notna();d[col+'_buy_bench']=weighted(vals,weights);d[col+'_coverage']=sum(weights[ok])/sum(weights)*100 if sum(weights) else None
  for pos,pg in g.groupby('pos'):
   d['pos_own'][pos]=weighted(pg.own,pg.own);d['pos_form'][pos]=weighted(pg.form5,pg.buy_weight)
  fields[(slug,rn)]=d
 selected=[];squads=[];keys=set();errors=[];transfer_checks=[]
 for d in read_squads(ROOT):
  key=(d['franchise'],d['slug'],d['team'],d['round'])
  if key in keys:raise ValueError(('duplicate squad',key))
  keys.add(key);current=[p for p in d['players'] if 'prev' not in p['class']];xi=[p for p in current if 'reserve' not in p['class']];cap=[p for p in current if 'is_captain' in p['class']]
  if not current and d.get('lineup_missing'):
   st=state.get((d['franchise'],d['slug'],d['round'],str(d['team'])),{})
   squads.append({k:d[k] for k in ['franchise','manager','team','slug','round']}|{'n_xi':0,'n_buy':0,'source':d['url'],'personal_only':d.get('personal_only',False),'lineup_missing':True,'active':st.get('active'),'frozen':st.get('frozen')})
   continue
  if len(current)!=15 or len(xi)!=11 or len(cap)!=1:errors.append({'key':key,'n':len(current),'xi':len(xi),'cap':len(cap)});continue
  field=fields[(d['slug'],d['round'])];byid={};count_buy=0
  for p in current:
   row=lookup.get((d['slug'],d['round'],p['id']),{}).copy()
   row.update({'franchise':d['franchise'],'manager':d['manager'],'personal_only':d.get('personal_only',False),'team':d['team'],'slug':d['slug'],'round':d['round'],'h2h_id':p['id'],'name':p['name'],'is_xi':'reserve' not in p['class'],'is_cap':'is_captain' in p['class'],'is_buy':'in' in p['class'] and d['round']>1,'source':d['url']})
   for col in ['form5','form3','trend','xgi90','minutes5','delta']:
    base=field.get('buy_delta_bench' if col=='delta' else col+'_buy_bench');v=row.get(col);row[col+'_gap']=v-base if v is not None and base is not None else None
   if row.get('pos') and row.get('form5') is not None:
    base=field['pos_form'].get(row['pos']);row['form5_pos_gap']=row['form5']-base if base is not None else None
   count_buy+=int(row['is_buy']);selected.append(row);byid[p['id']]=row
  xx=[byid[p['id']] for p in xi];capt=byid[cap[0]['id']];buys=[v for v in byid.values() if v['is_buy']]
  r={'franchise':d['franchise'],'manager':d['manager'],'team':d['team'],'slug':d['slug'],'round':d['round'],'n_xi':11,'n_buy':len(buys),'captain':capt['name'],'captain_id':capt['h2h_id'],'source':d['url'],'own':avg([x.get('own') for x in xx]),'own_global':avg([x.get('own_global') for x in xx]),'own_field':avg([field['pos_own'].get(x.get('pos')) for x in xx]),'cap_own':capt.get('own'),'cap':capt.get('cap'),'cap_field':field['cap_bench'],'modal_cap':field['modal_cap'],'diff_share':avg([float(x['own']<10)*100 for x in xx if x.get('own') is not None]),'high_share':avg([float(x['own']>=50)*100 for x in xx if x.get('own') is not None]),'buy_delta':avg([x.get('delta') for x in buys]),'buy_delta_field':field['buy_delta_bench'],'buy_form':avg([x.get('form5') for x in buys]),'buy_form_field':field['form5_buy_bench'],'form_field_coverage':field['form5_coverage'],'buy_form_gap':avg([x.get('form5_gap') for x in buys]),'buy_form_pos_gap':avg([x.get('form5_pos_gap') for x in buys]),'buy_trend':avg([x.get('trend') for x in buys]),'buy_xgi_gap':avg([x.get('xgi90_gap') for x in buys]),'buy_minutes_gap':avg([x.get('minutes5_gap') for x in buys]),'buy_form_n':sum(pd.notna(x.get('form5')) for x in buys)}
  r['own_gap']=r['own']-r['own_field'] if r['own'] is not None else None;r['cap_gap']=r['cap']-r['cap_field'] if r['cap'] is not None else None;r['buy_delta_gap']=r['buy_delta']-r['buy_delta_field'] if r['buy_delta'] is not None and r['buy_delta_field'] is not None else None
  r['rare_cap']=float(r['cap']<10)*100 if r['cap'] is not None else None;r['modal_match']=float(r['cap']>=r['modal_cap']-.15)*100 if r['cap'] is not None else None
  for model in ['fo','alt','ffo']:
   r[model+'_xi']=avg([x.get(model) for x in xx]);r[model+'_xi_pct']=avg([x.get(model+'_pct') for x in xx]);r[model+'_cap']=capt.get(model);r[model+'_buy_pct']=avg([x.get(model+'_pct') for x in buys]);r[model+'_n']=sum(pd.notna(x.get(model)) for x in xx)
   valid=[x.get(model) for x in xx if pd.notna(x.get(model))];r[model+'_cap_loss']=max(valid)-capt[model] if len(valid)>=9 and pd.notna(capt.get(model)) else None
   r['current_'+model]=avg([x.get('current_'+model) for x in xx])
  losses=[r[m+'_cap_loss'] for m in ['fo','alt','ffo']];r['triple_cap_disagree']=float(all(v>=2 for v in losses))*100 if all(pd.notna(v) for v in losses) else None
  r['buy_peak']=avg([100*float(x.get('trend',-999)>=2) for x in buys if pd.notna(x.get('trend'))]);r['buy_cold']=avg([100*float(x.get('form5_gap',999)<-1) for x in buys if pd.notna(x.get('form5_gap'))])
  st=state.get((d['franchise'],d['slug'],d['round'],str(d['team'])),{})
  r.update({'active':st.get('active'),'frozen':st.get('frozen'),'personal_only':d.get('personal_only',False),'lineup_missing':False})
  squads.append(r)
 s=pd.DataFrame(squads);z=pd.DataFrame(selected)
 # Direct XI benchmark for the observed franchise comparison cohort.
 cohort=s.drop_duplicates(['slug','round','team']).groupby(['slug','round']).own.mean()
 s['own_cohort']=[cohort.loc[(row.slug,row.round)] for row in s.itertuples()];s['own_cohort_gap']=s.own-s.own_cohort
 # Price/position controls compare purchases with actual observed peer purchases.
 buy=z[z.is_buy].copy()
 for c in ['fo_pct','alt_pct','ffo_pct','price_pre','minutes5','form5','xgi90','delta','own']:
  buy[c+'_peer_gap']=buy[c]-buy.groupby(['slug','round','pos'])[c].transform('mean')
 buy['triple_model_low']=np.where(buy[['fo_pct_peer_gap','alt_pct_peer_gap','ffo_pct_peer_gap']].notna().all(axis=1),(buy[['fo_pct_peer_gap','alt_pct_peer_gap','ffo_pct_peer_gap']]<=-10).all(axis=1).astype(float),np.nan)
 buy['cold_with_followup']=(buy.form5_gap<-1)&buy.outcome_next3.notna()
 buy['early_success']=(buy.outcome_next3-buy.form5>=2)&buy.cold_with_followup
 # Equal league weights; manager/round observations retain their within-league weight.
 metrics=['own','own_global','own_field','own_gap','own_cohort_gap','cap','cap_own','cap_field','cap_gap','diff_share','high_share','rare_cap','modal_match','buy_delta','buy_delta_field','buy_delta_gap','buy_form','buy_form_field','buy_form_gap','buy_form_pos_gap','buy_trend','buy_peak','buy_cold','buy_xgi_gap','buy_minutes_gap','fo_xi_pct','alt_xi_pct','ffo_xi_pct','fo_buy_pct','alt_buy_pct','ffo_buy_pct','fo_cap_loss','alt_cap_loss','ffo_cap_loss','triple_cap_disagree']
 league=s.groupby(['franchise','slug'])[metrics].mean().reset_index();overall=league.groupby('franchise')[metrics].mean().reset_index()
 for key in ['own_cohort_gap','cap_gap','buy_delta_gap']:overall[key+'_score']=(len(overall)-rankdata(overall[key],method='average'))/(len(overall)-1)*100
 overall['style_score']=overall.own_cohort_gap_score*.4+overall.cap_gap_score*.3+overall.buy_delta_gap_score*.3
 overall=overall.sort_values('style_score',ascending=False);overall['rank']=range(1,len(overall)+1)
 def aggstats(fid,g):
  unique=g.drop_duplicates(['slug','round','h2h_id']);low=g[g.triple_model_low==1];lu=low.drop_duplicates(['slug','round','h2h_id'])
  return {'purchases':len(g),'unique_purchases':len(unique),'form_coverage':float(g.form5.notna().mean()*100),'model_coverage':int(g[['fo_pct','alt_pct','ffo_pct']].notna().all(axis=1).sum()),'triple_low':len(low),'triple_low_unique':len(lu),'low_stats':{c:avg(lu[c].tolist()) for c in ['price_pre_peer_gap','form5_peer_gap','minutes5_peer_gap','xgi90_peer_gap','delta_peer_gap','own_peer_gap']},'all_stats':{c:avg(unique[c].tolist()) for c in ['price_pre_peer_gap','form5_peer_gap','minutes5_peer_gap','xgi90_peer_gap']}}
 extras={int(fid):aggstats(fid,g) for fid,g in buy.groupby('franchise')}
 manager=s.groupby(['franchise','manager'])[metrics].mean().reset_index();manager['n_rounds']=s.groupby(['franchise','manager']).size().values
 manager['n_buys']=s.groupby(['franchise','manager']).n_buy.sum().values
 # Cluster intervals resample managers, preserving their cross-round decisions.
 rng=np.random.default_rng(20260920);cis={}
 for fid,g in s.groupby('franchise'):
  mgr=g.groupby(['manager','slug'])[metrics].mean().groupby('manager').mean();a=mgr[['own_cohort_gap','cap_gap','buy_delta_gap','buy_form_gap']].to_numpy();ix=rng.integers(0,len(a),(1000,len(a)));v=np.nanmean(a[ix],axis=1)
  cis[int(fid)]={k:list(np.nanpercentile(v[:,i],[2.5,97.5])) for i,k in enumerate(['own_cohort_gap','cap_gap','buy_delta_gap','buy_form_gap'])}
 recent=s.sort_values('round').groupby(['franchise','slug','team']).tail(1).groupby(['franchise','slug'])[['current_fo','current_alt','current_ffo']].mean().groupby('franchise').mean().reset_index()
 # Season-level summaries include audit links and concrete disagreements.
 out=[]
 for r in overall.to_dict('records'):
  fid=r['franchise'];fr=next(x for x in franchises if x['id']==fid);ss=s[s.franchise==fid];bg=buy[buy.franchise==fid]
  examples=bg[bg.triple_model_low==1].sort_values('fo_pct_peer_gap').drop_duplicates(['slug','round','h2h_id']).head(12)
  caps=ss[ss.triple_cap_disagree==100].sort_values('fo_cap_loss',ascending=False).head(12)
  r.update({'name':fr['name'],'roster':fr['roster'],'n_rounds':len(ss),'n_leagues':ss.slug.nunique(),'n_managers':ss.manager.nunique(),'n_buys':int(ss.n_buy.sum()),'n_captain_model':int(ss.triple_cap_disagree.notna().sum()),'n_forecast_fo':int(ss.fo_n.sum()),'n_forecast_alt':int(ss.alt_n.sum()),'n_forecast_ffo':int(ss.ffo_n.sum()),'ci':cis[int(fid)],'purchase_stats':extras.get(int(fid),{}),'current':recent[recent.franchise==fid].to_dict('records')[0],'leagues':league[league.franchise==fid].to_dict('records'),'managers':manager[manager.franchise==fid].to_dict('records'),'examples':examples[['manager','slug','round','name','club','pos','own','delta','form5','form5_gap','price_pre','fo','alt','ffo','fo_pct','alt_pct','ffo_pct','source']].to_dict('records'),'captain_examples':caps[['manager','slug','round','captain','cap','fo_cap','alt_cap','ffo_cap','fo_cap_loss','alt_cap_loss','ffo_cap_loss','source']].to_dict('records')})
  r['active_summary']=ss[ss.active==True].groupby('slug')[metrics].mean().mean().to_dict()
  r['n_active']=int((ss.active==True).sum())
  unique=bg.drop_duplicates(['slug','round','h2h_id'])
  r['purchase_stats'].update({'cold_followup':int(unique.cold_with_followup.sum()),'early_success':int(unique.early_success.sum())})
  r['early_examples']=unique[unique.early_success].sort_values('outcome_next3',ascending=False).head(6)[['name','slug','round','form5','form5_gap','outcome_next3','source']].to_dict('records')
  out.append(r)
 detailcols=['franchise','manager','slug','round','name','club','pos','is_xi','is_cap','is_buy','own','own_global','cap','delta','form5','form_n','trend','xgi90','minutes5','fo','alt','ffo','price_pre','cutoff','last_history_date','source']
 z.to_pickle(ROOT/'source/decisions.pkl');buy.to_pickle(ROOT/'source/purchases.pkl');s.to_pickle(ROOT/'source/squad-metrics.pkl')
 save('decisions.json',clean(z[detailcols].to_dict('records')))
 save('report-data.json',clean({'generated':dt.datetime.now(dt.timezone.utc).isoformat(),'franchises':out,'league_names':{'rfpl_2026':'Россия','epl_2026':'Англия','championship_2026':'Чемпионшип','la_liga_2026':'Испания','bundesliga_2026':'Германия','france_2026':'Франция','seria_a_2026':'Италия','portugal_2026':'Португалия','eredivisie_2026':'Нидерланды','turkey_2026':'Турция','ucl_2026':'Лига чемпионов','liga_europa_2026':'Лига Европы'},'audit':audit,'squads':s.to_dict('records'),'errors':errors,'n_squads':len(s),'n_decisions':len(z),'n_buys':len(buy),'n_player_rounds':z.drop_duplicates(['slug','round','h2h_id']).shape[0]}))
 print(overall[['franchise','rank','style_score','own','cap','buy_delta','buy_form_gap']].round(2).to_string(index=False));print('TOTAL',len(s),len(z),len(buy),'errors',len(errors))
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='aggregate':aggregate()
 else:features()
