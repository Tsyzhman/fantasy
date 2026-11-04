"""One eligible franchise XI with complete source and personal populations.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts
@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes
@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
"""
import contextlib
import gzip
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

import analyze
import enrich
import export_snapshot
import research
import research_hypotheses
from fixtures.collector_fixture import create


class FranchiseCohortTests(unittest.TestCase):
    def test_nullable_and_numpy_boolean_frame_flags_keep_only_explicit_active(self):
        registry = [{'id': 1}, {'id': -1, 'kind': 'virtual'}]
        for dtype, values in [('bool', [True, False, False, True]), ('object', [np.bool_(True), False, None, None]), ('boolean', [True, False, pd.NA, pd.NA])]:
            with self.subTest(dtype=dtype):
                frame = pd.DataFrame({'franchise': [1, 1, 1, -1], 'slug': ['l'] * 4, 'round': [1] * 4, 'team': ['a', 'b', 'c', 'd'], 'active': pd.Series(values, dtype=dtype), 'personal_only': pd.Series([False, False, False, True], dtype='boolean')})
                self.assertEqual(analyze.eligible_frame_keys(frame, registry), {(1, 'l', 1, 'a'), (-1, 'l', 1, 'd')})
                self.assertEqual(list(analyze.filter_squad_frame(frame, set()).columns), list(frame.columns))

    def run_fixture(self, empty=False):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            create(root)
            freeze = json.loads((root / 'freezes.json').read_text('utf-8'))
            target = next(row for row in freeze['states'] if (row['franchise'], row['slug'], row['round'], row['team']) == (1, 'epl_2026', 2, '100'))
            target.update(active=False, frozen=True)
            freeze['states'].append({**target, 'source': target['source'] + '/second', 'active': True, 'frozen': False})
            freeze['events'] = [{'franchise': 1, 'slug': 'epl_2026', 'round': 2, 'source': target['source'], 'board_verified': True}]
            freeze['basis'] = [{'franchise': 1, 'slug': 'epl_2026', 'round': 2, 'source': target['source'], 'n_active': 6}]
            source = root / 'source/squads/epl_2026-101-2.json'
            squad = json.loads(source.read_text('utf-8'));squad['memberships'][0]['personal_only'] = True
            source.write_text(json.dumps(squad), encoding='utf-8')
            if empty:
                for row in freeze['states']:
                    row.update(active=False, frozen=False)
                for source in (root / 'source/squads').glob('*.json'):
                    squad = json.loads(source.read_text('utf-8'))
                    squad['memberships'] = [m for m in squad['memberships'] if m['franchise'] != -1]
                    source.write_text(json.dumps(squad), encoding='utf-8')
            (root / 'freezes.json').write_text(json.dumps(freeze), encoding='utf-8')
            before = (root / 'freezes.json').read_bytes()
            with contextlib.ExitStack() as stack, contextlib.redirect_stdout(io.StringIO()):
                for module in [research, analyze, enrich, research_hypotheses, export_snapshot]:
                    stack.enter_context(patch.object(module, 'ROOT', root))
                analyze.features();analyze.aggregate();enrich.main();research_hypotheses.main();export_snapshot.main()
            self.assertEqual((root / 'freezes.json').read_bytes(), before)
            result = json.loads(gzip.decompress((root / 'snapshot.json.gz').read_bytes()))
            report = json.loads((root / 'report-data.json').read_text('utf-8'))
            validation = json.loads((root / 'validation.json').read_text('utf-8'))
            hypotheses = json.loads((root / 'nonbudget-hypotheses.json').read_text('utf-8'))
            frames = [pd.read_pickle(root / 'source' / name) for name in ['squad-metrics.pkl', 'decisions.pkl', 'purchases.pkl']]
        return result, report, validation, hypotheses, frames, freeze

    def test_full_pipeline_uses_active_any_once_preserving_all_personal_rows_and_events(self):
        snapshot, report, validation, hypotheses, (squads, decisions, buys), freeze = self.run_fixture()
        self.assertEqual((len(snapshot['squads']), len(squads), report['n_squads'], validation['counts']['n_squads']), (200, 200, 200, 200))
        self.assertEqual(len(snapshot['purchases']), len(buys))
        self.assertEqual(report['n_decisions'], len(decisions))
        self.assertFalse(squads.duplicated(['franchise', 'slug', 'round', 'team']).any())
        target = next(row for row in snapshot['squads'] if (row['franchise'], row['slug'], row['round'], row['team']) == (1, 'epl_2026', 2, '100'))
        self.assertIs(target['active'], True);self.assertIs(target['frozen'], True)
        groups = {row['franchise']: row for row in report['franchises']}
        self.assertEqual({fid: row['n_rounds'] for fid, row in groups.items()}, {1: 47, 2: 48, 3: 48, -1: 8})
        self.assertEqual({row['slug']: row['squads'] for row in groups[1]['coverage_by_league']}, {'epl_2026': 23, 'rfpl_2026': 24})
        self.assertEqual(groups[1]['xfo_summary']['finished'], 35)
        self.assertEqual(groups[-1]['xfo_summary']['finished'], 6)
        eligible = squads[(squads.franchise == 1) & (squads.active == True) & ~squads.personal_only]
        expected = eligible.groupby('slug').own.mean().mean()
        self.assertAlmostEqual(groups[1]['own'], expected)
        self.assertEqual(groups[1]['n_buys'], int(eligible.n_buy.sum()))
        personal = next(row for row in groups[1]['managers'] if row['manager'] == 'Manager 1-1')
        self.assertEqual(personal['n_rounds'], 8)
        self.assertEqual(sum(row['n_rounds'] for row in groups[1]['managers']), 64)
        self.assertEqual(snapshot['freeze']['events'], freeze['events'])
        self.assertEqual(snapshot['freeze']['basis'], freeze['basis'])
        self.assertNotIn('states', snapshot['freeze'])
        self.assertEqual(report['checks']['unique_squads'], 200)
        self.assertEqual(report['checks']['duplicate_selections'], 0)
        self.assertEqual(set(hypotheses), {'1', '2', '3', '-1'})

    def test_no_eligible_xi_keeps_groups_and_personal_managers_with_null_franchise_metrics(self):
        snapshot, report, validation, hypotheses, (squads, decisions, buys), freeze = self.run_fixture(empty=True)
        self.assertEqual((len(snapshot['squads']), len(squads), validation['counts']['n_squads']), (192, 192, 192))
        self.assertEqual(len(snapshot['purchases']), len(buys))
        self.assertEqual(len(report['franchises']), 4)
        self.assertEqual(sum(len(row['managers']) for row in report['franchises']), 24)
        for row in report['franchises']:
            self.assertEqual(row['n_rounds'], 0)
            self.assertIsNone(row['rank']);self.assertIsNone(row['style_score']);self.assertIsNone(row['own'])
            self.assertEqual(row['purchase_stats']['purchases'], 0)
            self.assertEqual(row['xfo_summary']['finished'], 0)
            self.assertEqual(row['coverage_by_league'], [])
            self.assertEqual(hypotheses[str(row['franchise'])], {'unique_low': 0, 'signals': {}})
        self.assertTrue(len(decisions) > 0)

    def test_hypothesis_cases_and_controls_use_eligible_population_but_keep_all_purchases(self):
        configurations = [(1, True, False, 1, 1), (1, True, False, 0, 50), (1, True, False, 0, 50), (1, True, False, 0, 50), (1, False, False, 0, 1), (1, True, True, 0, 1), (1, False, False, 1, 1), (-1, None, True, 0, 50), (-1, None, True, 1, 1)]
        squads, buys = [], []
        for i, (fid, active, personal, low, own) in enumerate(configurations):
            key = {'franchise': fid, 'slug': 'l', 'round': 1, 'team': str(i)}
            squads.append(key | {'active': active, 'personal_only': personal})
            buys.append(key | {'personal_only': personal, 'h2h_id': str(i), 'name': str(i), 'manager': 'Fixture', 'source': 'fixture', 'pos': 'Нп', 'player_id': np.nan, 'history_matches': [], 'own': own, 'trend': 0, 'fdr_pre': 1, 'triple_model_low': low})
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory);(root / 'source').mkdir()
            (root / 'franchises.json').write_text(json.dumps([{'id': 1}, {'id': -1, 'kind': 'virtual'}]), encoding='utf-8')
            pd.DataFrame(squads).to_pickle(root / 'source/squad-metrics.pkl');pd.DataFrame(buys).to_pickle(root / 'source/purchases.pkl')
            with patch.object(research_hypotheses, 'ROOT', root), patch.object(research, 'ROOT', root), patch.object(research_hypotheses, 'stream', return_value=iter([])), contextlib.redirect_stdout(io.StringIO()):
                research_hypotheses.main()
            result = json.loads((root / 'nonbudget-hypotheses.json').read_text('utf-8'))
            retained = pd.read_pickle(root / 'source/purchases.pkl')
        self.assertEqual(len(retained), len(buys))
        for fid in ['1', '-1']:
            self.assertEqual(result[fid]['unique_low'], 1)
            self.assertEqual(result[fid]['signals']['rare']['control'], 0)
            self.assertEqual(result[fid]['signals']['rare']['share'], 100)


if __name__ == '__main__':
    unittest.main()
