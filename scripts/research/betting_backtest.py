"""Exploratory chronological betting test. Research only; no wager execution.

Protocol fixed before calculating returns: previous-day features, >=5 prior
league matches per team; train before Nov 2025, validation Nov-Dec, holdout
Jan-Jun 2026. Select at most one model/threshold per market on validation;
refit before January; closing Bet365 odds with actual margin retained.
"""
import os
os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import json, pathlib, unicodedata, re, difflib, hashlib
from collections import defaultdict, deque
import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, brier_score_loss

ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'.tmp/betting-research-20260907'
EVIDENCE=ROOT/'specs/work/evidence/WI-002'
EVIDENCE.mkdir(parents=True,exist_ok=True)
CODES={'E0':47,'E1':48,'D1':54,'I1':55,'SP1':87,'F1':53,'N1':57,'P1':61,'B1':40,'T1':71}
ALIASES={'Man United':'Manchester United','Man City':'Manchester City','Wolves':'Wolverhampton Wanderers','Nott\'m Forest':'Nottingham Forest','Tottenham':'Tottenham Hotspur','M\'gladbach':'Borussia Moenchengladbach','Ein Frankfurt':'Eintracht Frankfurt','FC Koln':'FC Cologne','Bayern Munich':'Bayern München','Dortmund':'Borussia Dortmund','St Pauli':'St. Pauli','Leverkusen':'Bayer Leverkusen','RB Leipzig':'RB Leipzig','Hamburg':'Hamburger SV','Ath Madrid':'Atletico Madrid','Ath Bilbao':'Athletic Club','Sociedad':'Real Sociedad','Betis':'Real Betis','Espanol':'Espanyol','Paris SG':'Paris Saint-Germain','St Etienne':'Saint-Etienne','Inter':'Inter','Verona':'Hellas Verona','Milan':'AC Milan','Sp Lisbon':'Sporting CP','Sp Braga':'Braga','Guimaraes':'Vitoria de Guimaraes','AVS':'AVS Futebol SAD','AZ Alkmaar':'AZ Alkmaar','PSV Eindhoven':'PSV Eindhoven','St Truiden':'St.Truiden','Standard':'Standard Liege','Buyuksehyr':'Istanbul Basaksehir','Karagumruk':'Fatih Karagumruk','Genclerbirligi':'Genclerbirligi'}
def norm(x):
    if x=='QPR': x='Queens Park Rangers'
    x=ALIASES.get(x,x)
    return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',x).encode('ascii','ignore').decode().lower())
def similarity(a,b):
    a,b=norm(a),norm(b)
    if a==b:return 1
    if min(len(a),len(b))>=4 and (a in b or b in a): return .94
    return difflib.SequenceMatcher(None,a,b).ratio()

def load_matches():
    m=pd.read_json(OUT/'matches.json'); m['date']=pd.to_datetime(m.match_date).dt.normalize()
    scores=pd.read_json(OUT/'team_scores.json').set_index(['match_id','team_id']).goals
    for side in ['home','away']:
        fallback=pd.Series([scores.get((r.id,r[side+'_team_id']),np.nan) for _,r in m.iterrows()],index=m.index)
        m[side+'_score']=m[side+'_score'].fillna(fallback)
    m=m[m.finished & ~m.cancelled & m.home_score.notna() & m.away_score.notna()].copy()
    return m.sort_values(['date','id']).reset_index(drop=True)

def join_archive(m):
    joined=[]; failures=[]; mismatches=[]; used=set(); meta=[]
    for code,lid in CODES.items():
        path=OUT/'external'/f'{code}.csv'
        ext=pd.read_csv(path,encoding='utf-8-sig'); ext=ext.dropna(subset=['HomeTeam','AwayTeam','FTHG','FTAG']).copy()
        ext['date']=pd.to_datetime(ext.Date,dayfirst=True,format='mixed').dt.normalize()
        for _,r in ext.iterrows():
            c=m[(m.league_id==lid)&(m.date==r.date)]
            ranked=sorted([(min(similarity(r.HomeTeam,x.home),similarity(r.AwayTeam,x.away)),x) for _,x in c.iterrows()],key=lambda z:z[0],reverse=True)
            if not ranked or ranked[0][0]<.60 or (len(ranked)>1 and ranked[0][0]-ranked[1][0]<.15):
                failures.append({'code':code,'date':str(r.date.date()),'h':r.HomeTeam,'a':r.AwayTeam,'candidates':[(round(s,3),x.home,x.away) for s,x in ranked[:2]]}); continue
            s,x=ranked[0]
            if x.id in used: raise ValueError('Duplicate match mapping')
            used.add(x.id)
            if x.home_score!=r.FTHG or x.away_score!=r.FTAG:
                mismatches.append({'id':int(x.id),'db':[x.home_score,x.away_score],'archive':[r.FTHG,r.FTAG]})
            d=r.to_dict(); d['id']=int(x.id); d['mapping_similarity']=s; joined.append(d)
        meta.append({'code':code,'league_id':lid,'rows':len(ext),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'url':f'https://football-data.co.uk/mmz4281/2526/{code}.csv'})
    (EVIDENCE/'archive_matching.json').write_text(json.dumps({'sources':meta,'matched':len(joined),'unmatched':failures,'score_mismatches':mismatches},indent=2),encoding='utf-8')
    return pd.DataFrame(joined),failures,mismatches

def features(m):
    # Team histories are league-specific. Process whole UTC day before updates.
    hist=defaultdict(lambda:deque(maxlen=10)); result=[]
    for day,group in m.groupby('date',sort=True):
        for _,r in group.iterrows():
            h=hist[(r.league_id,r.home_team_id)]; a=hist[(r.league_id,r.away_team_id)]
            if min(len(h),len(a))<5:continue
            d={'id':r.id,'date':day,'league_id':r.league_id,'home_score':r.home_score,'away_score':r.away_score,'hxg':r.hxg,'axg':r.axg}
            for side,history in [('h',h),('a',a)]:
                arr=np.array([t[1] for t in history],dtype=float)
                for k,col in enumerate(['gf','ga','xf','xa','sf','sa','sotf','sota']):
                    vals=arr[:,k]; valid=vals[np.isfinite(vals)]
                    prior=1.35 if k<4 else 12 if k<6 else 4
                    d[side+'_'+col]=(valid.sum()+3*prior)/(len(valid)+3)
                d[side+'_rest']=min((day-history[-1][0]).days,30)
                d[side+'_history_last']=history[-1][0]
                d[side+'_n']=len(history)
            d['p_h_lambda']=np.clip((d['h_xf']+d['a_xa'])/2*1.10,.2,4.5)
            d['p_a_lambda']=np.clip((d['a_xf']+d['h_xa'])/2*.90,.2,4.5)
            result.append(d)
        for _,r in group.iterrows():
            for team,vals in [(r.home_team_id,[r.home_score,r.away_score,r.hxg,r.axg,r.hshots,r.ashots,r.hsot,r.asot]),(r.away_team_id,[r.away_score,r.home_score,r.axg,r.hxg,r.ashots,r.hshots,r.asot,r.hsot])]:
                hist[(r.league_id,team)].append((day,vals))
    return pd.DataFrame(result)

if __name__=='__main__':
    m=load_matches(); archive,failures,mismatches=join_archive(m)
    # Archive is the same outcome authority for ALL matched fixtures, not only
    # disagreements. Do not select test membership based on the match result.
    canonical=archive.set_index('id')
    for col,source in [('home_score','FTHG'),('away_score','FTAG')]:
        m[col]=m.id.map(canonical[source]).fillna(m[col])
    f=features(m); f.to_pickle(OUT/'features.pkl'); archive.to_pickle(OUT/'archive.pkl')
    print('matched',len(archive),'failures',len(failures),'score mismatches',len(mismatches),'feature rows',len(f))
    print(json.dumps(failures[:50],ensure_ascii=False,indent=1))
