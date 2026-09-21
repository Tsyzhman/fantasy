from analyze import *
def main():
 d=json.loads((ROOT/'report-data.json').read_text('utf-8'));freeze=json.loads((ROOT/'freezes.json').read_text('utf-8'))
 s=pd.read_pickle(ROOT/'source/squad-metrics.pkl');z=pd.read_pickle(ROOT/'source/decisions.pkl');buy=pd.read_pickle(ROOT/'source/purchases.pkl')
 metrics=['own','own_gap','own_cohort_gap','cap','cap_gap','buy_delta','buy_delta_gap','buy_form_gap','diff_share','rare_cap','buy_peak','buy_cold']
 mgr=s.groupby(['franchise','manager','slug'])[metrics].mean().groupby(['franchise','manager']).mean().reset_index()
 for key in ['own_cohort_gap','cap_gap','buy_delta_gap']:mgr[key+'_score']=(len(mgr)-mgr[key].rank(method='average'))/(len(mgr)-1)*100
 mgr['style_score']=mgr.own_cohort_gap_score*.4+mgr.cap_gap_score*.3+mgr.buy_delta_gap_score*.3
 mgr['rank']=mgr.style_score.rank(method='min',ascending=False).astype(int)
 for fr in d['franchises']:
  fid=fr['franchise'];g=buy[buy.franchise==fid];low=g[g.triple_model_low==1].drop_duplicates(['slug','round','h2h_id']);ps=fr['purchase_stats']
  ps['cheap_low_pct']=float((low.price_pre_peer_gap<=-1).mean()*100) if len(low) else None
  ps['low_own_pct']=float((low.own_peer_gap<=-10).mean()*100) if len(low) else None
  ps['low_form_pct']=float((low.form5_peer_gap>=1).mean()*100) if len(low) else None
  ps['overall_mean_delta_per_purchase']=avg(g.delta.tolist())
  ps['mean_delta_gap_per_purchase']=avg(g.delta_gap.tolist())
  ps['form_field_coverage']=avg(s[s.franchise==fid].form_field_coverage.tolist())
  for m in fr['managers']:
   v=mgr[(mgr.franchise==fid)&(mgr.manager==m['manager'])].iloc[0].to_dict();m.update(v)
   mg=g[g.manager==m['manager']];ms=s[(s.franchise==fid)&(s.manager==m['manager'])];mn=int(mg.triple_model_low.notna().sum());ml=int((mg.triple_model_low==1).sum());cn=int(ms.triple_cap_disagree.notna().sum());cl=int((ms.triple_cap_disagree==100).sum())
   m.update({'model_buy_n':mn,'model_buy_low_n':ml,'model_buy_low_rate':ml/mn*100 if mn else None,'model_cap_n':cn,'model_cap_low_n':cl,'model_cap_low_rate':cl/cn*100 if cn else None})
  # Concrete captain alternatives were already available in that manager's XI.
  proofs=[]
  for x in fr['captain_examples']:
   xx=z[(z.franchise==fid)&(z.manager==x['manager'])&(z.slug==x['slug'])&(z['round']==x['round'])&z.is_xi]
   cap=xx[xx.is_cap].iloc[0];pool=xx.dropna(subset=['fo','alt','ffo']).copy();pool['consensus']=pool[['fo','alt','ffo']].mean(axis=1)
   candidate=pool.sort_values('consensus',ascending=False).iloc[0]
   p={**x,'own':cap.own,'form5':cap.form5,'alternative':candidate['name'],'alternative_form':candidate.form5,'alternative_own':candidate.own,'alternative_fo':candidate.fo,'alternative_alt':candidate.alt,'alternative_ffo':candidate.ffo}
   proofs.append(p)
  fr['captain_proofs']=proofs
  ss=s[s.franchise==fid];fr['coverage_by_league']=[{'slug':slug,'squads':len(gg),'active':int(gg.active.sum()),'managers':gg.manager.nunique(),'buys':int(gg.n_buy.sum()),'form_buys':int(gg.buy_form_n.sum()),'fo':int(gg.fo_n.sum()),'alt':int(gg.alt_n.sum()),'ffo':int(gg.ffo_n.sum()),'n_xi':len(gg)*11} for slug,gg in ss.groupby('slug')]
 # Source acquisition time range, validate compressed HTTP files without retaining bodies.
 times=[];urls=set();cache_bytes=0
 for p in (ROOT/'source/http').glob('*.json.gz'):
  v=json.loads(gzip.decompress(p.read_bytes()));times.append(v['fetchedAt']);urls.add(v['url']);cache_bytes+=p.stat().st_size
 d['acquisition']={'from':min(times),'to':max(times),'cached_requests':len(times),'unique_urls':len(urls),'http_bytes':cache_bytes}
 d['freeze']={k:freeze[k] for k in ['events','summary','audit']}
 d['manager_ranking']=mgr.sort_values('rank').to_dict('records')
 d['checks']={'unique_squads':len(s.drop_duplicates(['slug','round','team'])),'all_xi_11':bool((s.n_xi==11).all()),'active_squads_per_franchise':{str(x['franchise']):x['n_active'] for x in d['franchises']},'missing_active_state':int(s.active.isna().sum()),'future_history':int((pd.to_datetime(z.last_history_date)>=(pd.to_datetime(z.cutoff)-pd.Timedelta(hours=3))).sum()),'duplicate_selections':int(z.duplicated(['slug','round','team','h2h_id']).sum()),'source_fnl_files':len(list((ROOT/'source/squads').glob('*fnl*'))),'freeze_verified':sum(x['board_verified'] for x in freeze['events'])}
 save('report-data.json',clean(d));save('validation.json',clean({'counts':{k:d[k] for k in ['n_squads','n_decisions','n_buys','n_player_rounds']},'checks':d['checks'],'acquisition':d['acquisition'],'source_audit':d['audit']}))
 print('CHECKS',d['checks']);print('ACQUISITION',d['acquisition'])
if __name__=='__main__':main()
