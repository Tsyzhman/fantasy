"""No-budget hypotheses. @spec spec://modules/franchises/FEAT-005-franchise-analytics#time"""
from research import ROOT,save
from analyze import stream,clean
import pandas as pd,numpy as np
def main():
 b=pd.read_pickle(ROOT/'source/purchases.pkl')
 unique=b.drop_duplicates(['slug','round','h2h_id']).copy();needed={(mid,int(r.player_id)) for r in unique.itertuples() if pd.notna(r.player_id) and isinstance(r.history_matches,list) for mid in r.history_matches}
 hist={}
 for r in stream('stats'):
  key=(r['match_id'],r['player_id'])
  if key in needed:hist[key]=r
 computed=[]
 for r in unique.itertuples():
  x={'slug':r.slug,'round':r.round,'h2h_id':r.h2h_id,'minutes_change':None,'attack_change':None,'underreturn':None}
  hh=[hist[(mid,int(r.player_id))] for mid in r.history_matches if (mid,int(r.player_id)) in hist] if pd.notna(r.player_id) and isinstance(r.history_matches,list) else []
  last=hh[-3:];old=hh[:-3]
  if len(last)==3 and len(old)>=3:x['minutes_change']=np.mean([a['minutes'] for a in last])-np.mean([a['minutes'] for a in old])
  def rate(rr):
   rr=[a for a in rr if a['xg'] is not None and a['xa'] is not None and a['minutes']]
   return sum(a['xg']+a['xa'] for a in rr)/sum(a['minutes'] for a in rr)*90 if len(rr)>=3 else None
  aa,bb=rate(last),rate(old)
  if aa is not None and bb is not None:x['attack_change']=aa-bb
  last5=hh[-5:]
  if len(last5)==5 and all(a['xg'] is not None and a['xa'] is not None and a['goals'] is not None and a['assists'] is not None for a in last5):x['underreturn']=sum(a['xg']+a['xa']-a['goals']-a['assists'] for a in last5)
  computed.append(x)
 b=b.drop(columns=['minutes_change','attack_change','underreturn'],errors='ignore').merge(pd.DataFrame(computed),on=['slug','round','h2h_id'],how='left',validate='many_to_one')
 flags={'rare':('own',lambda v:v<10),'minutes_rise':('minutes_change',lambda v:v>=15),'attack_rise':('attack_change',lambda v:v>=.15),'underreturn':('underreturn',lambda v:v>=1),'form_rise':('trend',lambda v:v>=2),'hard_fixture':('fdr_pre',lambda v:v>=4)}
 for flag,(col,fn) in flags.items():b['flag_'+flag]=np.where(b[col].notna(),fn(b[col]).astype(float),np.nan)
 b.to_pickle(ROOT/'source/purchases.pkl')
 controls=b[b.triple_model_low==0].drop_duplicates(['slug','round','h2h_id'])
 grouped={k:g for k,g in controls.groupby(['slug','round','pos'])}
 out={};rng=np.random.default_rng(20260920)
 for fid,g in b.groupby('franchise'):
  low=g[g.triple_model_low==1].drop_duplicates(['slug','round','h2h_id']);res={}
  for flag in flags:
   pairs=[];cases=[]
   for r in low.to_dict('records'):
    cc=grouped.get((r['slug'],r['round'],r['pos']))
    if cc is None or pd.isna(r['flag_'+flag]):continue
    cc=cc[cc.h2h_id!=r['h2h_id']];cv=cc['flag_'+flag].dropna()
    if len(cv)<3:continue
    pairs.append((r['flag_'+flag],float(cv.mean())))
    if r['flag_'+flag]==1:
     col=flags[flag][0];cases.append({k:r[k] for k in ['name','manager','slug','round','source']}|{'value':r[col]})
   pp=np.array(pairs);nn=len(pp)
   if nn:
    diffs=(pp[:,0]-pp[:,1])*100;boot=np.mean(diffs[rng.integers(0,nn,(1000,nn))],axis=1)
    res[flag]={'n':nn,'yes':int(pp[:,0].sum()),'share':pp[:,0].mean()*100,'control':pp[:,1].mean()*100,'gap':diffs.mean(),'ci':list(np.percentile(boot,[2.5,97.5])),'examples':cases[:3]}
  out[str(int(fid))]={'unique_low':len(low),'signals':res}
 save('nonbudget-hypotheses.json',clean(out))
 for fid,v in out.items():print(fid,[(k,x['n'],round(x['share']),round(x['control']),round(x['gap'])) for k,x in v['signals'].items()])
if __name__=='__main__':main()
