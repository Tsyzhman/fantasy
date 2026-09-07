"""Independent checks for chronological feature generation and evidence."""
from betting_feature_data import *
import zipfile,importlib.metadata

f=pd.read_pickle(NEW/'rich_features.pkl');m=pd.read_pickle(NEW/'all_matches.pkl')
checks=0
for _,r in f.iloc[::113].iterrows():
    for side,team in [('h',r.HomeTeam),('a',r.AwayTeam)]:
        hist=m[(m.league_id==r.league_id)&(m.date<r.date)&((m.HomeTeam==team)|(m.AwayTeam==team))].sort_values(['date','id']).tail(3)
        vals=np.where(hist.HomeTeam==team,hist.FTHG,hist.FTAG).astype(float)
        weights=np.power(.5,np.arange(len(vals)-1,-1,-1)/1.5)
        expected=(np.sum(vals*weights)+2*1.35)/(weights.sum()+2)
        assert np.isclose(expected,r[f'{side}_gf_3']),r.id
        assert (hist.date<r.date).all();checks+=1
for name in ['rich_results.json','weather_results.json']:
    result=json.loads((EV/name).read_text())
    for market,output in result.items():
        assert output['test_first']>='2026-07-01'
        for freeze in output['frozen']:
            family=[x for x in output['validation_grid'] if x['family']==freeze['family']]
            assert np.isclose(freeze['val_logloss'],min(x['val_logloss'] for x in family))
            s=freeze['selected_threshold']
            if s:assert s['n']>=50
for path in EV.glob('*_bets.json'):
    d=pd.read_json(path)
    if len(d):
        assert not d.id.duplicated().any();assert (d.date>=pd.Timestamp('2026-07-01')).all()
        assert np.allclose(d.profit,d.win*d.odds-1)
weather=pd.read_pickle(NEW/'weather.pkl');assert not weather.id.duplicated().any()
assert all(c.endswith('_previous_day1') for c in weather.columns if c!='id')
manifest={}
inputs=list(NEW.glob('*.csv'))+list(NEW.glob('weather_*.json'))+[NEW/'grounds.html']
with zipfile.ZipFile(EV/'additional_inputs.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for path in inputs:
        z.write(path,path.name);manifest[path.name]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
with zipfile.ZipFile(EV/'additional_inputs.zip') as z:
    assert z.testzip() is None
    for name,meta in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==meta['sha256']
(EV/'input_manifest.json').write_text(json.dumps(manifest,indent=2))
result={'independent_prior_day_ewm_checks':checks,'frozen_choices_min_validation_loss':'passed','fresh_period_and_unique_bet_payout_checks':'passed','weather_previous_day1_and_dedup':'passed','weather_matches':len(weather),'archive_sha256_crc':'passed','versions':{n:importlib.metadata.version(n) for n in ['numpy','pandas','scipy','scikit-learn']},'cache_bytes':sum(p.stat().st_size for p in NEW.rglob('*') if p.is_file()),'input_zip_bytes':(EV/'additional_inputs.zip').stat().st_size}
(EV/'verification.json').write_text(json.dumps(result,indent=2));print(result)
