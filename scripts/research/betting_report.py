"""Write compact research evidence, figures and an immutable input archive."""
import json, pathlib, hashlib, zipfile, platform
import numpy as np
import pandas as pd
import plotly.graph_objects as go
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'.tmp/betting-research-20260907'
EVIDENCE=ROOT/'specs/work/evidence/WI-002'

r=json.loads((EVIDENCE/'results.json').read_text(encoding='utf-8'))
m=pd.read_json(OUT/'matches.json');m['match_date']=pd.to_datetime(m.match_date)
f=m[m.finished & ~m.cancelled]
inventory={'matches':len(m),'finished':len(f),'leagues':int(m.league_id.nunique()),'league_season_pairs':len(m[['league_id','season']].drop_duplicates()),'finished_both_xg':int(f[['hxg','axg']].notna().all(axis=1).sum()),'finished_missing_score':int(f[['home_score','away_score']].isna().any(axis=1).sum()),'first_finished':str(f.match_date.min()),'last_finished':str(f.match_date.max()),'python':platform.python_version()}
for name in ['counts','duplicates','db_health','sports_aux_counts','team_membership','point_in_time']:
    inventory[name]=json.loads((OUT/(name+'.json')).read_text(encoding='utf-8'))
(EVIDENCE/'inventory.json').write_text(json.dumps(inventory,indent=2,ensure_ascii=False),encoding='utf-8')
coverage=f.groupby(['league_id','league','season'],dropna=False).agg(matches=('id','size'),home_score=('home_score','count'),away_score=('away_score','count'),home_xg=('hxg','count'),away_xg=('axg','count'),first=('match_date','min'),last=('match_date','max')).reset_index()
coverage.to_json(EVIDENCE/'league_coverage.json',orient='records',date_format='iso',indent=2)
for name in ['player_coverage','forecast_coverage']:
    (EVIDENCE/(name+'.json')).write_bytes((OUT/(name+'.json')).read_bytes())

series=[]
labels={'poisson_xg':'xG / Poisson','logistic_stats':'Goals + xG + shots','blend_market_80_xg_20':'80% market + 20% xG'}
for market in ['1x2','total25']:
    for name in labels:
        q=next(x for x in r['archive'][market]['holdout_grid'] if x['model']==name and x['threshold']==.05)
        series.append((f"{market}: {labels[name]} (n={q['n']})",q))
q=next(x for x in r['fonbet']['results'] if x['lead_minutes_gt']==5 and x['threshold']==.05)
series.append((f"Fonbet team totals (n={q['n']})",q))
fig=go.Figure(go.Scatter(x=[q['roi']*100 for _,q in series],y=[label for label,_ in series],mode='markers',marker={'size':10,'color':'#2463a2'},error_x={'type':'data','symmetric':False,'array':[(q['ci95_week_bootstrap'][1]-q['roi'])*100 for _,q in series],'arrayminus':[(q['roi']-q['ci95_week_bootstrap'][0])*100 for _,q in series]}))
fig.add_vrect(x0=20,x1=30,fillcolor='orange',opacity=.12,line_width=0,annotation_text='Target 20–30%')
fig.add_vline(x=0,line_color='gray')
fig.update_layout(title='Observed ROI and 95% weekly block bootstrap intervals',xaxis_title='Net profit / total stake, %',yaxis={'autorange':'reversed'},template='plotly_white',height=540,margin={'l':300})
fig.write_html(EVIDENCE/'roi_intervals.html',include_plotlyjs=True,full_html=True)

# Keep original data once, compressed; calculated caches are reproducible.
inputs=[p for p in OUT.glob('*.json') if p.name!='manifest.json']+list((OUT/'external').glob('*.csv'))+[OUT/'external/notes.txt',OUT/'external/downloadm.php']
manifest={}
with zipfile.ZipFile(EVIDENCE/'inputs.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in inputs:
        rel=p.relative_to(OUT).as_posix();z.write(p,rel);manifest[rel]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(EVIDENCE/'input_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(inventory,ensure_ascii=False));print('input archive bytes',(EVIDENCE/'inputs.zip').stat().st_size)
