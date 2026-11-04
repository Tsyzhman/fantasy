"""Eligible franchise summaries/examples retain full raw and personal histories.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts
@spec spec://modules/franchises/FEAT-005-franchise-analytics#xfo
@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
"""
import contextlib
import copy
import gzip
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd

import export_snapshot


class ExportEligibilityTests(unittest.TestCase):
    def test_reserve_examples_cannot_evict_active_frozen_or_virtual_examples_and_raw_rows_remain(self):
        slug = 'fixture_2026'
        configurations = [(401, 'reserve-a', False, True, False, 1000), (401, 'reserve-b', False, False, False, 100), (401, 'active', True, True, False, 10), (-1, 'virtual', None, None, True, 7), (401, 'personal', None, None, True, 500)]
        squads, decisions, sources, stats = [], [], [], []
        for group_index, (fid, team, active, frozen, personal, actual) in enumerate(configurations):
            squads.append({'franchise': fid, 'slug': slug, 'round': 1, 'team': team, 'manager': 'Fixture', 'n_buy': 1, 'active': active, 'frozen': frozen, 'personal_only': personal})
            players = []
            for slot in range(11):
                pid = group_index * 100 + slot + 1
                decisions.append({'franchise': fid, 'manager': 'Fixture', 'slug': slug, 'round': 1, 'team': team, 'h2h_id': str(pid), 'name': team + '-' + str(slot), 'player_id': pid, 'pos': 'Нп', 'is_cap': slot == 0, 'is_xi': True, 'is_buy': slot == 1, 'source': 'https://fantasy-h2h.ru/fixture', 'personal_only': personal})
                players.append({'id': str(pid), 'class': ['is_captain'] if slot == 0 else [], 'score': actual * (2 if slot == 0 else 1)})
                stats.append({'match_id': 300, 'player_id': pid, 'minutes': 90, 'xg': 0, 'xa': 0, 'recoveries': 0, 'team_id': 1, 'opponent_team_id': 2})
            sources.append({'slug': slug, 'round': 1, 'team': team, 'players': players})
        tables = {'price-mapping': [], 'matches': [{'id': 300, 'league_id': 47, 'season': '2026/2027', 'finished': True, 'cancelled': False, 'home_team_id': 1, 'away_team_id': 2, 'match_date': '2026-11-01T12:00:00Z'}], 'team-stats': [{'match_id': 300, 'team_id': 2, 'xg': 1}], 'stats': stats}
        freeze = {'states': [{'source': 'board-a', 'active': False, 'frozen': True}, {'source': 'board-b', 'active': True, 'frozen': False}], 'events': [{'source': 'board-a', 'franchise': 401, 'slug': slug, 'round': 1, 'n': 1, 'gain': 2}], 'basis': [{'franchise': 401, 'slug': slug, 'round': 1, 'n_active': 6}]}
        before = copy.deepcopy(freeze)
        report = {'errors': [], 'checks': {'future_history': 0, 'duplicate_selections': 0, 'missing_active_state': 0}, 'squads': squads, 'franchises': [{'franchise': 401, 'name': 'Ordinary'}, {'franchise': -1, 'name': 'Virtual'}], 'league_names': {slug: 'Fixture'}, 'acquisition': {'from': '2026-11-01T00:00:00Z', 'to': '2026-11-01T00:00:00Z'}}
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory);(root / 'source').mkdir()
            for name, value in [('report-data.json', report), ('freezes.json', freeze), ('franchises.json', [{'id': 401, 'name': 'Ordinary'}, {'id': -1, 'name': 'Virtual', 'kind': 'virtual'}]), ('leagues.json', [{'slug': slug, 'league_id': 47, 'rounds': [{'round': 1, 'matches': [{'date': '1 Ноя 2026, 15:00', 'finished': True}]}]}])]:
                (root / name).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            pd.DataFrame(decisions).to_pickle(root / 'source/decisions.pkl')
            pd.DataFrame([row for row in decisions if row['is_buy']]).to_pickle(root / 'source/purchases.pkl')
            with patch.object(export_snapshot, 'ROOT', root), patch.object(export_snapshot, 'stream', side_effect=lambda name: iter(tables[name])), patch.object(export_snapshot, 'read_squads', side_effect=lambda root, expand=False: iter(sources)), contextlib.redirect_stdout(io.StringIO()):
                export_snapshot.main()
            result = json.loads(gzip.decompress((root / 'snapshot.json.gz').read_bytes()))
            enriched = json.loads((root / 'report-data.json').read_text('utf-8'))
            self.assertEqual(json.loads((root / 'freezes.json').read_text('utf-8')), before)
        self.assertEqual(len(result['squads']), 5)
        self.assertEqual(len(result['purchases']), 5)
        self.assertEqual({row['team'] for row in result['squads']}, {x[1] for x in configurations})
        ordinary = [x for x in result['xfoExamples'] if x['franchise'] == 401]
        virtual = [x for x in result['xfoExamples'] if x['franchise'] == -1]
        self.assertEqual(len(ordinary), 2)
        self.assertTrue(all(x['team'] == 'active' for x in ordinary))
        self.assertEqual(len(virtual), 2)
        self.assertTrue(all(x['personal_only'] for x in virtual))
        summary = next(f['xfo_summary'] for f in enriched['franchises'] if f['franchise'] == 401)
        self.assertEqual((summary['complete'], summary['finished'], summary['slots']), (1, 1, 11))
        self.assertEqual((summary['xfo'], summary['actual'], summary['gap']), (33, 110, 77))
        self.assertTrue(all(row['xfo_complete'] for row in result['squads']))
        self.assertEqual(result['freeze']['events'], before['events'])
        self.assertEqual(result['freeze']['basis'], before['basis'])


if __name__ == '__main__':
    unittest.main()
