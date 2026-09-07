"""WI-003 predeclared search: tune through May 2026; freeze before new 2026/27.

Primary selection: minimum validation log loss per model family. Choose a
staking threshold on validation only (>=50 bets); retain negative results.
Fresh period is only evaluated after choices have been fixed. Earlier WI-002
period is now development data, not claimed as a fresh holdout.
"""
from betting_feature_data import *
from betting_evaluate import summary,bets
from scipy.stats import poisson
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import log_loss

def probabilities(lh,la,market):
    if market=='total25':
        p=poisson.sf(2,lh+la);return np.column_stack([p,1-p])
    h=poisson.pmf(np.arange(20)[None,:],lh[:,None]);a=poisson.pmf(np.arange(20)[None,:],la[:,None]);j=h[:,:,None]*a[:,None,:]
    p=np.stack([np.tril(j,-1).sum((1,2)),np.trace(j,axis1=1,axis2=2),np.triu(j,1).sum((1,2))],axis=1)
    return p/p.sum(1,keepdims=True)

def poisson_prediction(d,market,w,xgweight,restcoef):
    mu=(d.league_hg+d.league_ag)/2
    def mix(side,name):return (1-xgweight)*d[f'{side}_g{name}_{w}']+xgweight*d[f'{side}_x{name}_{w}']
    lh=d.league_hg*(mix('h','f')/mu*mix('a','a')/mu)**.75
    la=d.league_ag*(mix('a','f')/mu*mix('h','a')/mu)**.75
    congestion=d.h_short_rest-d.a_short_rest
    lh=lh*np.exp(restcoef*congestion);la=la*np.exp(-restcoef*congestion)
    return probabilities(np.clip(lh,.15,5).to_numpy(),np.clip(la,.15,5).to_numpy(),market)

def columns(d):
    form=[c for c in d if re.fullmatch('[ha]_(gf|ga|xf|xa|sf|sa|tf|ta|xg_coverage)_(3|5|10|20)',c)]
    base=form+['elo_diff','h_venue_gf','h_venue_ga','a_venue_gf','a_venue_ga','league_hg','league_ag']+[c for c in d if c.startswith('league_dummy_')]
    rest=['h_rest','a_rest','rest_advantage','h_short_rest','a_short_rest','h_games_7','a_games_7','h_games_14','a_games_14','h_games_21','a_games_21','congestion_advantage']
    weather=[c for c in d if c.endswith('_previous_day1')]
    return {'form':base,'form_rest':base+rest,'market_form_rest':base+rest+[c for c in d if c.startswith('market_log_')],'market_form_rest_weather':base+rest+[c for c in d if c.startswith('market_log_')]+weather}

def run(weather=False):
    d=pd.read_pickle(NEW/'rich_features.pkl')
    if weather:
        w=pd.read_pickle(NEW/'weather.pkl');d=d.merge(w,on='id',validate='one_to_one').dropna(subset=[c for c in w if c!='id'])
    d=pd.concat([d,pd.get_dummies(d.league_id,prefix='league_dummy',dtype=float)],axis=1)
    result={}
    for market in ['1x2','total25']:
        ocols=['B365CH','B365CD','B365CA'] if market=='1x2' else ['B365C>2.5','B365C<2.5']
        acols=['AvgCH','AvgCD','AvgCA'] if market=='1x2' else ['AvgC>2.5','AvgC<2.5']
        z=d.dropna(subset=ocols+acols).copy();z=z[(z[ocols+acols]>1).all(axis=1)]
        fair=(1/z[acols].to_numpy());fair=fair/fair.sum(1,keepdims=True)
        for k in range(fair.shape[1]):z['market_log_'+str(k)]=np.log(fair[:,k])
        if market=='1x2':z['y']=np.where(z.home_score>z.away_score,0,np.where(z.home_score==z.away_score,1,2))
        else:z['y']=np.where(z.home_score+z.away_score>2.5,0,1)
        train=z[z.date<'2026-01-01'];val=z[(z.date>='2026-01-01')&(z.date<'2026-07-01')];test=z[z.date>='2026-07-01']
        def marketp(x):return np.exp(x[['market_log_'+str(k) for k in range(fair.shape[1])]].to_numpy())
        sets=columns(z);grid=[];best={}
        def candidate(family,name,params,predict):
            p=predict(val);loss=float(log_loss(val.y,p));grid.append({'family':family,'name':name,'params':params,'val_logloss':loss})
            if family not in best or loss<best[family]['loss']:best[family]={'name':name,'params':params,'loss':loss,'predict':predict,'vp':p}
        candidate('market','market',{},marketp)
        if not weather:
            for window in [3,5,10,20]:
                for weight in [0,.25,.5,.75,1]:
                    for rc in [0,-.04,-.08]:
                        params={'window':window,'xg_weight':weight,'short_rest_coefficient':rc}
                        fun=lambda x,w=window,g=weight,r=rc:poisson_prediction(x,market,w,g,r)
                        candidate('poisson','poisson',params,fun)
                        for blend in [.1,.25,.5]:
                            candidate('market_blend','market_blend',{**params,'stats_weight':blend},lambda x,f=fun,b=blend:b*f(x)+(1-b)*marketp(x))
        names=['form','form_rest','market_form_rest'] if not weather else ['market_form_rest','market_form_rest_weather']
        for group in names:
            cols=sets[group]
            for C in [.01,.1,1,10]:
                model=make_pipeline(SimpleImputer(strategy='median',keep_empty_features=True),StandardScaler(),LogisticRegression(C=C,max_iter=2000))
                model.fit(train[cols],train.y)
                candidate('logistic_'+group,'logistic',{'features':group,'C':C},lambda x,mod=model,c=cols:mod.predict_proba(x[c]))
        for group in (['form_rest','market_form_rest'] if not weather else ['market_form_rest','market_form_rest_weather']):
            cols=sets[group]
            for leaves in [3,7,15]:
                model=HistGradientBoostingClassifier(max_iter=150,max_leaf_nodes=leaves,learning_rate=.04,l2_regularization=10,min_samples_leaf=35,early_stopping=False,random_state=20260907)
                model.fit(train[cols],train.y)
                candidate('boosting_'+group,'hist_gradient_boosting',{'features':group,'leaves':leaves},lambda x,mod=model,c=cols:mod.predict_proba(x[c]))
        frozen=[]
        for family,item in best.items():
            thresholds=[]
            for t in [0,.03,.05,.1,.2]:
                b=bets(val,item['vp'],val[ocols].to_numpy(),val.y.to_numpy(),t)
                thresholds.append({'threshold':t,**summary(b)})
            eligible=[v for v in thresholds if v['n']>=50]
            selected=max(eligible,key=lambda v:v['roi']) if eligible else None
            frozen.append({'family':family,'model':item['name'],'params':item['params'],'val_logloss':item['loss'],'thresholds':thresholds,'selected_threshold':selected})
        # Record frozen choices before evaluating a single outcome in 2026/27.
        prefix='weather' if weather else 'rich'
        (EV/f'{prefix}_{market}_frozen.json').write_text(json.dumps(frozen,indent=2))
        holdout=[]
        for item in frozen:
            chosen=best[item['family']];p=chosen['predict'](test)
            t=item['selected_threshold']['threshold'] if item['selected_threshold'] else .05
            b=bets(test,p,test[ocols].to_numpy(),test.y.to_numpy(),t)
            b.to_json(EV/f'{prefix}_{market}_{item["family"]}_bets.json',orient='records',date_format='iso',indent=2)
            holdout.append({'family':item['family'],'params':item['params'],'threshold':t,'val_roi':None if not item['selected_threshold'] else item['selected_threshold']['roi'],'test_logloss':float(log_loss(test.y,p)),'test':summary(b,True)})
        result[market]={'train_n':len(train),'val_n':len(val),'test_n':len(test),'train_first':str(train.date.min()),'test_first':str(test.date.min()),'test_last':str(test.date.max()),'grid_count':len(grid),'validation_grid':grid,'frozen':frozen,'fresh_holdout':holdout}
        print(prefix,market,'n',len(train),len(val),len(test),'grid',len(grid),flush=True)
        print(json.dumps(holdout),flush=True)
    (EV/('weather_results.json' if weather else 'rich_results.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')

if __name__=='__main__':
    import sys
    run('--weather' in sys.argv)
