"""Evaluate predeclared research models against executable quoted odds.

Fixed test protocol: validation Nov-Dec 2025, holdout Jan-Jun 2026; four
models x four EV thresholds per market, no search on holdout. Unit stakes,
at most one selection per match per market. Uncertainty clusters by week.
"""
from betting_backtest import *

COLS=[s+'_'+c for s in ['h','a'] for c in ['gf','ga','xf','xa','sf','sa','sotf','sota','rest']]
THRESHOLDS=[0,.05,.10,.20]

def fit_predict(train,test,market):
    def y(d):
        if market=='1x2':return np.where(d.home_score>d.away_score,0,np.where(d.home_score==d.away_score,1,2))
        return np.where(d.home_score+d.away_score>2.5,0,1)
    model=make_pipeline(StandardScaler(),LogisticRegression(C=.1,max_iter=1500))
    model.fit(train[COLS],y(train))
    stats=model.predict_proba(test[COLS])
    lh=test.p_h_lambda.to_numpy(); la=test.p_a_lambda.to_numpy()
    if market=='1x2':
        ph=poisson.pmf(np.arange(20)[None,:],lh[:,None]); pa=poisson.pmf(np.arange(20)[None,:],la[:,None]); joint=ph[:,:,None]*pa[:,None,:]
        xp=np.stack([np.tril(joint,-1).sum((1,2)),np.trace(joint,axis1=1,axis2=2),np.triu(joint,1).sum((1,2))],axis=1)
        oddscols=['B365CH','B365CD','B365CA']; avgcols=['AvgCH','AvgCD','AvgCA']
    else:
        over=poisson.sf(2,lh+la); xp=np.column_stack([over,1-over]); oddscols=['B365C>2.5','B365C<2.5']; avgcols=['AvgC>2.5','AvgC<2.5']
    odds=test[oddscols].to_numpy(float); avg=test[avgcols].to_numpy(float)
    fair=(1/avg)/(1/avg).sum(axis=1,keepdims=True)
    return {'poisson_xg':xp,'logistic_stats':stats,'blend_market_80_xg_20':.8*fair+.2*xp,'market_only':fair},odds,y(test)

def bets(d,p,odds,y,threshold):
    ev=p*odds-1
    valid=np.isfinite(ev)&(odds>=1.2)&(odds<=6)
    ev=np.where(valid,ev,-np.inf)
    ix=ev.argmax(axis=1); edge=ev[np.arange(len(ix)),ix]; take=edge>=threshold
    b=d.loc[take,['id','date','league_id']].copy()
    b['selection']=ix[take]; b['odds']=odds[np.arange(len(ix)),ix][take]; b['p']=p[np.arange(len(ix)),ix][take]
    b['win']=(ix==y)[take]; b['profit']=b.win*b.odds-1; b['ev']=edge[take]
    return b.sort_values(['date','id'])

def summary(b,bootstrap=False):
    if not len(b): return {'n':0,'roi':None}
    profit=b.profit.to_numpy(float); equity=np.r_[0,np.cumsum(profit)]
    s={'n':len(b),'matches':int(b.id.nunique()),'wins':int(b.win.sum()),'avg_odds':float(b.odds.mean()),'profit_units':float(profit.sum()),'roi':float(profit.mean()),'predicted_ev':float(b.ev.mean()),'max_drawdown_units':float(np.max(np.maximum.accumulate(equity)-equity)),'roi_odds_minus_2pct':float((b.win*b.odds*.98-1).mean()),'roi_odds_minus_5pct':float((b.win*b.odds*.95-1).mean())}
    if bootstrap:
        weeks=b.date.dt.to_period('W').astype(str); groups=b.groupby(weeks).agg(profit=('profit','sum'),n=('profit','size'))
        rng=np.random.default_rng(20260907); picks=rng.integers(0,len(groups),size=(10000,len(groups)))
        returns=groups.profit.to_numpy()[picks].sum(1)/groups.n.to_numpy()[picks].sum(1)
        s['week_blocks']=len(groups);s['ci95_week_bootstrap']=np.quantile(returns,[.025,.975]).tolist()
    return s

def eval_archive():
    f=pd.read_pickle(OUT/'features.pkl'); a=pd.read_pickle(OUT/'archive.pkl')
    d=f.merge(a.drop(columns=['date']),on='id',validate='one_to_one').sort_values(['date','id'])
    output={}
    for market,required in [('1x2',['B365CH','B365CD','B365CA','AvgCH','AvgCD','AvgCA']),('total25',['B365C>2.5','B365C<2.5','AvgC>2.5','AvgC<2.5'])]:
        z=d.dropna(subset=required).copy();z=z[(z[required]>1).all(axis=1)]
        train=z[z.date<'2025-11-01']; val=z[(z.date>='2025-11-01')&(z.date<'2026-01-01')]; test=z[(z.date>='2026-01-01')&(z.date<'2026-07-01')]
        vp,vo,vy=fit_predict(train,val,market); hp,ho,hy=fit_predict(z[z.date<'2026-01-01'],test,market)
        validation=[]; holdout=[]; metrics={}; betframes={}
        for name in vp:
            metrics[name]={'val_logloss':float(log_loss(vy,vp[name])),'test_logloss':float(log_loss(hy,hp[name])),'test_brier_multiclass':float(((hp[name]-np.eye(hp[name].shape[1])[hy])**2).sum(axis=1).mean())}
            for t in THRESHOLDS:
                vb=bets(val,vp[name],vo,vy,t); hb=bets(test,hp[name],ho,hy,t)
                validation.append({'model':name,'threshold':t,**summary(vb)})
                holdout.append({'model':name,'threshold':t,**summary(hb,True)})
                betframes[(name,t)]=hb
        eligible=[r for r in validation if r['n']>=50 and r['roi']>0]
        selected=max(eligible,key=lambda r:r['roi']) if eligible else None
        chosen=None
        selected_path=EVIDENCE/f'{market}_selected_bets.json'
        if selected_path.exists(): selected_path.unlink()
        if selected:
            b=betframes[(selected['model'],selected['threshold'])]
            chosen={'selection':selected,'holdout':summary(b,True),'by_month':{str(k):summary(v) for k,v in b.groupby(b.date.dt.to_period('M'))},'by_league':{str(k):summary(v) for k,v in b.groupby('league_id')}}
            b.to_json(EVIDENCE/f'{market}_selected_bets.json',orient='records',date_format='iso',indent=2)
        # The fixed 5% threshold is disclosed for all models, selected or not.
        for name in hp:
            betframes[(name,.05)].to_json(EVIDENCE/f'{market}_{name}_5pct_bets.json',orient='records',date_format='iso',indent=2)
        output[market]={'train_n':len(train),'validation_n':len(val),'holdout_n':len(test),'holdout_first':str(test.date.min()),'holdout_last':str(test.date.max()),'bet365_mean_overround':float((1/ho).sum(1).mean()-1),'metrics':metrics,'validation_grid':validation,'holdout_grid':holdout,'selected':chosen,'selection_rule':'Highest validation ROI among 16 model/threshold combinations with >=50 validation bets and positive ROI; otherwise no strategy'}
        print(market,'train/val/test',len(train),len(val),len(test),'chosen',json.dumps(chosen,default=str),flush=True)
        print('fixed5',json.dumps([r for r in holdout if r['threshold']==.05]),flush=True)
    return output

def eval_fonbet():
    f=pd.read_pickle(OUT/'features.pkl'); m=load_matches(); o=pd.read_json(OUT/'odds.json')
    o=o.drop(columns=['id'])
    z=f.merge(o,left_on='id',right_on='match_id').merge(m[['id','match_date']],on='id')
    z['lead_minutes']=(pd.to_datetime(z.match_date)-pd.to_datetime(z.fetched_at)).dt.total_seconds()/60
    fetched_day=pd.to_datetime(z.fetched_at).dt.normalize()
    history_valid=(z.h_history_last<fetched_day)&(z.a_history_last<fetched_day)
    excluded_late_history=int((~history_valid & (z.lead_minutes>0)).sum())
    z=z[history_valid].copy()
    # Frozen Poisson model; no training on the small Fonbet sample and no threshold tuning.
    ph=poisson.sf(1,z.p_h_lambda);pa=poisson.sf(1,z.p_a_lambda)
    probs=np.column_stack([ph,1-ph,pa,1-pa]); odds=z[['home_over_15_odds','home_under_15_odds','away_over_15_odds','away_under_15_odds']].to_numpy(float)
    winners=np.column_stack([z.home_score>1.5,z.home_score<1.5,z.away_score>1.5,z.away_score<1.5])
    rows=[]
    for lead in [0,5,60]:
        take=z.lead_minutes>lead; zz=z[take].copy();pp=probs[take];oo=odds[take];ww=winners[take]
        ev=np.where(np.isfinite(oo)&(oo>=1.2)&(oo<=6),pp*oo-1,-np.inf)
        ix=ev.argmax(1); chosen_ev=ev[np.arange(len(ix)),ix]; win=ww[np.arange(len(ix)),ix]
        for t in [.05,.10,.20]:
            use=chosen_ev>=t;b=zz.loc[use,['id','date','league_id']].copy();b['selection']=ix[use];b['odds']=oo[np.arange(len(ix)),ix][use];b['win']=win[use];b['profit']=b.win*b.odds-1;b['ev']=chosen_ev[use]
            rows.append({'lead_minutes_gt':lead,'eligible_matches':len(zz),'threshold':t,**summary(b,True)})
            if lead in [5,60]:
                b.to_json(EVIDENCE/f'fonbet_lead{lead}_ev{t}.json',orient='records',date_format='iso',indent=2)
    timing=o.merge(m[['id','match_date']],left_on='match_id',right_on='id')
    timing['lead']=(pd.to_datetime(timing.match_date)-pd.to_datetime(timing.fetched_at)).dt.total_seconds()/60
    raw={'total_snapshots':len(o),'settled_with_score':len(timing),'strict_prematch':int((timing.lead>0).sum()),'before_5min':int((timing.lead>5).sum()),'before_60min':int((timing.lead>60).sum()),'at_or_after_kickoff':int((timing.lead<=0).sum()),'after_1min':int((timing.lead<-1).sum()),'timing_quantiles_minutes':timing.lead.quantile([0,.25,.5,.75,1]).to_dict()}
    print('FONBET',json.dumps({'audit':raw,'results':rows}),flush=True)
    return {'audit':raw,'excluded_prematch_history_after_snapshot':excluded_late_history,'results':rows,'method':'Frozen previous-10-match xG Poisson, max one team-total selection per match, no fitting/tuning on Fonbet; all thresholds exploratory; last history day precedes odds snapshot day'}

if __name__=='__main__':
    result={'protocol':__doc__,'archive':eval_archive(),'fonbet':eval_fonbet()}
    (EVIDENCE/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
