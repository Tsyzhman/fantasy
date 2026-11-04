"""Read-only post-run identity and completeness checks; run only after sync exits.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
"""
import collections
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import sys

root = pathlib.Path('/app/storage/franchises')
load = lambda name: json.loads((root / name).read_text())
validation = load('validation.json')
index = load('squad-index.json')
sys.path.insert(0, '/app/scripts/franchise-analytics')
from sources import registry, squad_sources

registered = registry()
leagues = {league['slug']: league for league in load('leagues.json')}
expected = set()
expected_observations = set()
groups = collections.Counter()
personal = collections.Counter()
for source in squad_sources(load('franchise-teams.json')):
    league = leagues[source['slug']]
    assert league['cid'] == source['cid']
    for rd in league['rounds']:
        if rd.get('tour') and (source['board'] or rd['round'] in source['available_rounds']):
            expected.add(f"{source['slug']}-{source['team']}-{rd['round']}.json")
            for membership in source['memberships']:
                groups[membership['franchise']] += 1
                personal[membership['franchise']] += int(membership.get('personal_only', False))
                expected_observations.add((membership['franchise'], source['slug'], rd['round'], str(source['team'])))
assert len(index) == len(set(index)) and set(index) == expected
path = root / 'snapshot.json.gz'
assert path.stat().st_size <= 64 * 1024**2
with gzip.open(path, 'rb') as stream:
    raw = stream.read(192 * 1024**2 + 1)
assert len(raw) <= 192 * 1024**2
snapshot = json.loads(raw)
del raw
assert snapshot['version'] == 2 and snapshot['personalHistory'] is True
assert snapshot['xfoCaptainMultiplier'] == 1
ids = [item['id'] for item in snapshot['franchises']]
assert len(ids) == len(set(ids))
assert set(ids) == set(registered['franchises']) | {group['id'] for group in registered['groups']}
actual = collections.Counter(item['franchise'] for item in snapshot['squads'])
actual_personal = collections.Counter()
observations = set()
roles = {}
freeze = load('freezes.json')
assert snapshot['freeze'] == {key: freeze[key] for key in ('events', 'basis')}
for state in freeze['states']:
    key = (state['franchise'], state['slug'], state['round'], str(state['team']))
    active, frozen = roles.get(key, (False, False))
    roles[key] = (active or state['active'], frozen or state['frozen'])
checked_roles = 0
virtual_ids = {item['id'] for item in snapshot['franchises'] if item.get('kind') == 'virtual'}
eligible_observations = set()
for item in snapshot['squads']:
    actual_personal[item['franchise']] += int(item.get('personal_only', False))
    key = (item['franchise'], item['slug'], item['round'], str(item['team']))
    assert key not in observations
    observations.add(key)
    if item['franchise'] in virtual_ids or (not item.get('personal_only', False) and item.get('active') is True):
        eligible_observations.add(key)
    if not item.get('personal_only', False) and key in roles:
        assert (item['active'], item['frozen']) == roles[key]
        checked_roles += 1
assert observations == expected_observations
assert actual == groups and actual_personal == personal
assert len(snapshot['squads']) == validation['counts']['n_squads'] == sum(groups.values())
assert snapshot['checks'] == validation['checks'] and snapshot['acquisition'] == validation['acquisition']
parse = lambda value: dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
assert parse(snapshot['generated']) >= parse(snapshot['acquisition']['to']) >= parse(sys.argv[1])
assert snapshot['checks']['all_xi_11'] is True
for name in ('future_history', 'duplicate_selections', 'missing_active_state'):
    assert snapshot['checks'][name] == 0
assert (root / '.heavy-job.lock').exists()
assert not any((root / name).exists() for name in ('.sync.lock', '.collection.lock', 'decisions.json', 'snapshot.json.gz.tmp', 'source/features.pkl', 'source/squad-metrics.pkl', 'source/decisions.pkl', 'source/purchases.pkl'))
print(json.dumps({'generated': snapshot['generated'], 'acquisition': snapshot['acquisition'],
                  'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'groups': len(ids),
                  'indexedSources': len(index), 'observations': len(snapshot['squads']),
                  'eligibleFranchiseObservations': len(eligible_observations),
                  'uniqueObservations': len(observations), 'roleUnionsChecked': checked_roles, 'freezeEvents': len(freeze['events']), 'freezeBasis': len(freeze['basis']),
                  'personal_by_group': dict(personal), 'stats_seasons': validation['source_audit']['stats_seasons'],
                  'checks': snapshot['checks']}, ensure_ascii=False))
