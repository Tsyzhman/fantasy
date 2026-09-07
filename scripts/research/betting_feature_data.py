"""Chronological research features and day-ahead weather; no production writes."""
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
import pathlib,json,re,html,urllib.request,urllib.parse,concurrent.futures,hashlib
import pandas as pd
import numpy as np
from collections import defaultdict,deque
from betting_backtest import ROOT,OUT,CODES,similarity

NEW=ROOT/'.tmp/betting-features-20260907'
EV=ROOT/'specs/work/evidence/WI-003';EV.mkdir(exist_ok=True,parents=True)

def build():
    core=pd.read_json(OUT/'matches.json');core['date']=pd.to_datetime(core.match_date).dt.normalize()
    frames=[]
    for season in ['2425','2526','2627']:
        for code,lid in CODES.items():
            path=OUT/'external'/f'{code}.csv' if season=='2526' else NEW/f'{season}_{code}.csv'
            d=pd.read_csv(path).dropna(subset=['FTHG','FTAG','HomeTeam','AwayTeam']).copy()
            d['date']=pd.to_datetime(d.Date,format='mixed',dayfirst=True).dt.normalize();d['league_id']=lid;d['season_code']=season
            d['id']=[f'{season}_{code}_{i}' for i in range(len(d))]
            d['home_score']=d.FTHG;d['away_score']=d.FTAG
            for k in ['hxg','axg','home_team_id','away_team_id']:d[k]=np.nan
            for i,r in d.iterrows():
                candidates=core[(core.league_id==lid)&(core.date==r.date)]
                ranked=sorted([(min(similarity(r.HomeTeam,x.home),similarity(r.AwayTeam,x.away)),x) for _,x in candidates.iterrows()],key=lambda z:z[0],reverse=True)
                if ranked and ranked[0][0]>=.60 and (len(ranked)==1 or ranked[0][0]-ranked[1][0]>.15):
                    x=ranked[0][1]
                    for k in ['hxg','axg','home_team_id','away_team_id']:d.at[i,k]=x[k]
            frames.append(d)
    matches=pd.concat(frames,ignore_index=True).sort_values(['date','id'])
    assert not matches.duplicated(['league_id','date','HomeTeam','AwayTeam']).any()
    matches.to_pickle(NEW/'all_matches.pkl')
    history=defaultdict(lambda:deque(maxlen=30));elo=defaultdict(lambda:1500.);league_hist=defaultdict(list);rows=[]
    # Calendar includes all observed cups as well as league games, without outcomes.
    cal=defaultdict(list)
    for _,r in core[core.finished & ~core.cancelled].iterrows():
        for tid in [r.home_team_id,r.away_team_id]:
            if pd.notna(tid):cal[tid].append(r.date)
    cal={k:sorted(set(v)) for k,v in cal.items()}
    for day,group in matches.groupby('date',sort=True):
        for _,r in group.iterrows():
            hk=(r.league_id,r.HomeTeam);ak=(r.league_id,r.AwayTeam);hh=history[hk];ah=history[ak]
            if min(len(hh),len(ah))<3:continue
            d=r.to_dict(); league=np.array(league_hist[r.league_id][-400:])
            d['league_hg']=(league[:,0].sum()+30*1.5)/(len(league)+30)
            d['league_ag']=(league[:,1].sum()+30*1.2)/(len(league)+30)
            d['elo_diff']=(elo[hk]-elo[ak])/400
            for side,hist,tid in [('h',hh,r.home_team_id),('a',ah,r.away_team_id)]:
                arr=np.array([v[1] for v in hist],float); dates=[v[0] for v in hist]
                for w in [3,5,10,20]:
                    vals=arr[-w:];weights=np.power(.5,np.arange(len(vals)-1,-1,-1)/(w/2))
                    for k,col in enumerate(['gf','ga','xf','xa','sf','sa','tf','ta']):
                        x=vals[:,k];valid=np.isfinite(x);prior=1.35 if k<4 else 12 if k<6 else 4
                        if k in [2,3] and not valid.any():x=vals[:,k-2];valid=np.isfinite(x)
                        d[f'{side}_{col}_{w}']=(np.sum(x[valid]*weights[valid])+2*prior)/(weights[valid].sum()+2)
                    d[f'{side}_xg_coverage_{w}']=float(np.isfinite(vals[:,2]).mean())
                loc=arr[arr[:,8]==(1 if side=='h' else 0)][-10:]
                for k,col in enumerate(['gf','ga']): d[f'{side}_venue_{col}']=(loc[:,k].sum()+3*1.35)/(len(loc)+3)
                d[f'{side}_n']=len(hist)
                known=sorted(set(dates+[v for v in cal.get(tid,[]) if v<day]))
                d[f'{side}_rest']=min((day-known[-1]).days,30)
                d[f'{side}_short_rest']=float(d[f'{side}_rest']<=3)
                for window in [7,14,21]:d[f'{side}_games_{window}']=sum((day-v).days<=window for v in known)
                d[f'{side}_goal_trend']=d[f'{side}_gf_3']-d[f'{side}_gf_20']
                d[f'{side}_xg_trend']=d[f'{side}_xf_3']-d[f'{side}_xf_20']
            d['rest_advantage']=d['h_rest']-d['a_rest'];d['congestion_advantage']=d['a_games_14']-d['h_games_14']
            rows.append(d)
        # All predictions for the day precede every update on that day.
        for _,r in group.iterrows():
            hk=(r.league_id,r.HomeTeam);ak=(r.league_id,r.AwayTeam)
            e=1/(1+10**((elo[ak]-elo[hk]-60)/400));score=float(r.FTHG>r.FTAG)+.5*float(r.FTHG==r.FTAG);change=20*(score-e)
            elo[hk]+=change;elo[ak]-=change;league_hist[r.league_id].append([r.FTHG,r.FTAG])
            history[hk].append((day,[r.FTHG,r.FTAG,r.hxg,r.axg,r.HS,r.AS,r.HST,r.AST,1]))
            history[ak].append((day,[r.FTAG,r.FTHG,r.axg,r.hxg,r.AS,r.HS,r.AST,r.HST,0]))
    features=pd.DataFrame(rows);features.to_pickle(NEW/'rich_features.pkl')
    print('feature_rows',len(features),'cols',len(features.columns),flush=True)

def fetch_weather():
    m=pd.read_pickle(NEW/'all_matches.pkl');m=m[m.league_id.isin([47,48])].copy()
    grounds=(NEW/'grounds.html').read_text(encoding='utf-8',errors='replace')
    # Author's gazetteer; first 92 clubs are the professional English divisions.
    locations=[]
    for name,lat,lon in re.findall(r'<b>([^<]+)</b>[^\n]*?maps\?q=([\d.-]+),([\d.-]+)',grounds)[:100]:
        locations.append((html.unescape(name),float(lat),float(lon)))
    terms=['temperature_2m_previous_day1','precipitation_previous_day1','wind_speed_10m_previous_day1']
    provenance=[];tasks=[]
    for team,g in m.groupby('HomeTeam'):
        ranked=sorted([(similarity(team,n),n,lat,lon) for n,lat,lon in locations],reverse=True)
        if not ranked or ranked[0][0]<.6:provenance.append({'team':team,'error':'no unambiguous coordinates'});continue
        _,name,lat,lon=ranked[0]
        tasks.append((team,g,lat,lon,name))
    def one(task):
        team,g,lat,lon,name=task;path=NEW/('weather_'+re.sub('[^a-zA-Z0-9]','',team)+'.json')
        if path.exists():return json.loads(path.read_text())
        params={'latitude':lat,'longitude':lon,'hourly':','.join(terms),'start_date':str(g.date.min().date()),'end_date':str(g.date.max().date()),'models':'ecmwf_ifs025','timezone':'GMT'}
        url='https://previous-runs-api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params)
        try:
            raw=json.load(urllib.request.urlopen(url,timeout=45));h=pd.DataFrame(raw['hourly']);h['time']=pd.to_datetime(h.time);h=h.set_index('time')
            records=[]
            for _,r in g.iterrows():
                # Football-Data kickoff times are British local time; convert DST.
                t=pd.Timestamp(str(r.date.date())+' '+str(r.Time)).tz_localize('Europe/London').tz_convert('UTC').tz_localize(None).floor('h')
                if t in h.index:records.append({'id':r.id,**{term:None if pd.isna(h.at[t,term]) else float(h.at[t,term]) for term in terms}})
            result={'team':team,'gazetteer_name':name,'latitude':lat,'longitude':lon,'resolved_grid':[raw['latitude'],raw['longitude']],'url':url,'records':records}
            path.write_text(json.dumps(result));return result
        except Exception as e:return {'team':team,'error':str(e)}
    allrows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(one,tasks):
            allrows+=result.pop('records',[]);provenance.append(result);print('weather',result['team'],result.get('error','OK'),flush=True)
    pd.DataFrame(allrows).to_pickle(NEW/'weather.pkl')
    (EV/'weather_sources.json').write_text(json.dumps(provenance,indent=2))
    print('weather_rows',len(allrows),flush=True)

if __name__=='__main__':
    import sys
    if '--weather' in sys.argv:fetch_weather()
    else:build()
