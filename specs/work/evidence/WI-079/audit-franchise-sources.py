"""Bounded source/cache validation after the completed production refresh."""
import collections
import datetime
import hashlib
import json
import pathlib
import time

root=pathlib.Path('/app/storage/franchises')
names=json.loads((root/'squad-index.json').read_text())
keys=set()
counts=collections.Counter()
cutoff='2026-10-21T08:08:16Z'
for name in names:
    if pathlib.Path(name).name!=name:raise ValueError('Unsafe source path')
    value=json.loads((root/'source/squads'/name).read_text())
    key=(value['slug'],value['round'],value['team'])
    if key in keys:counts['duplicate_squad_keys']+=1
    keys.add(key)
    active=[p['id'] for p in value['players'] if 'prev' not in p.get('class',[])]
    if len(active)!=len(set(active)):counts['duplicate_active_players']+=1
    if value.get('lineup_missing'):counts['missing_lineups']+=1
    if value.get('collected_finished') and not active:counts['empty_immutable_lineups']+=1
    if value.get('fetched_at','')>=cutoff:counts['sources_acquired_this_run']+=1
    elif not value.get('collected_finished'):counts['stale_mutable_sources']+=1
cache=list((root/'source/http').glob('*.json.gz'))
temporary=list((root/'source/http').glob('*.tmp'))
intermediates=[name for name in ['features.pkl','squad-metrics.pkl','decisions.pkl','purchases.pkl'] if (root/'source'/name).exists()]
leagues=json.loads((root/'leagues.json').read_text())
rounds=[(league['slug'],rd['round'],rd['index']) for league in leagues for rd in league['rounds']]
fixtures=collections.defaultdict(set)
for league in leagues:
    for rd in league['rounds']:
        for match in rd['matches']:
            if match.get('sports_match_id'):fixtures[(league['slug'],match['sports_match_id'])].add(rd['round'])
print(json.dumps({'captured_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'indexed_squads':len(names),'duplicate_index_names':len(names)-len(set(names)),'counts':dict(counts),'rounds':len(rounds),'duplicate_rounds':len(rounds)-len({r[:2] for r in rounds}),'duplicate_calendar_fixtures':sum(len(values)>1 for values in fixtures.values()),'cache':{'files':len(cache),'compressed_bytes':sum(p.stat().st_size for p in cache),'older_than_30_days':sum(time.time()-p.stat().st_mtime>30*86400 for p in cache),'temporary_files':len(temporary)},'intermediates_remaining':intermediates,'collection_markers':[p.name for p in [root/'.sync.lock',root/'.collection.lock'] if p.exists()],'snapshot_sha256':hashlib.sha256((root/'snapshot.json.gz').read_bytes()).hexdigest(),'validation':json.loads((root/'validation.json').read_text())},ensure_ascii=False))
