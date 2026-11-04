"""Bounded collector representation and output regression checks.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

import analyze


class MemoryRepresentationTests(unittest.TestCase):
    def test_columnar_rows_preserve_full_column_inference_order_and_nested_histories(self):
        rows = [
            {'slug': 'league-a', 'round': 1, 'forecast': None, 'captain': True, 'history_matches': [11, 12]},
            {'slug': 'league-a', 'round': 2, 'forecast': 1.25, 'captain': False, 'history_matches': []},
            {'slug': 'league-b', 'round': 3, 'forecast': np.nan, 'captain': True, 'extra': 'later column'},
            {'slug': 'league-b', 'round': 4, 'forecast': -2.5, 'captain': False, 'history_matches': None},
        ]
        columns = analyze.ColumnarRows()
        for row in rows:
            columns.append(row)
        result = columns.to_frame()
        pd.testing.assert_frame_equal(result, pd.DataFrame(rows))
        self.assertEqual(columns.columns, {})
        self.assertEqual(len(result), len(rows))

    def test_streamed_detail_json_preserves_nulls_numbers_unicode_and_all_records(self):
        frame = pd.DataFrame({'name': ['Игрок', 'Other'], 'value': [np.inf, -1.25], 'flag': [True, False], 'history': [[1, 2], None]})
        with tempfile.TemporaryDirectory() as directory, patch.object(analyze, 'ROOT', pathlib.Path(directory)):
            analyze.save_frame_records('records.json', frame)
            result = json.loads((pathlib.Path(directory) / 'records.json').read_text('utf-8'))
            self.assertEqual(result, analyze.clean(frame.to_dict('records')))
            self.assertFalse((pathlib.Path(directory) / 'records.json.tmp').exists())

    def test_failed_stream_keeps_previous_file_and_removes_temporary(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(analyze, 'ROOT', pathlib.Path(directory)):
            path = pathlib.Path(directory) / 'records.json'
            path.write_text('["previous"]', encoding='utf-8')
            with self.assertRaises(TypeError):
                analyze.save_frame_records('records.json', pd.DataFrame({'invalid': [object()]}))
            self.assertEqual(path.read_text('utf-8'), '["previous"]')
            self.assertFalse(path.with_name('records.json.tmp').exists())

    def test_distinct_h2h_duels_preserve_history_when_the_round_flags_agree(self):
        first = {'franchise': 1, 'slug': 'league', 'round': 10, 'team': '123', 'active': True, 'frozen': False, 'board': 1, 'score': 10, 'source': 'duel-a'}
        second = {**first, 'board': 4, 'score': 12, 'source': 'duel-b'}
        history = [first, second]
        result = analyze.validated_board_states(history)
        self.assertEqual(len(history), 2)
        self.assertTrue(result[(1, 'league', 10, '123')]['active'])
        self.assertFalse(result[(1, 'league', 10, '123')]['frozen'])

    def test_conflicting_flags_abort_aggregation_before_outputs_and_keep_previous_report(self):
        first = {'franchise': 1, 'slug': 'league', 'round': 10, 'team': '123', 'active': True, 'frozen': False}
        for second in [{**first, 'active': False}, {**first, 'frozen': True}]:
            with self.subTest(second=second), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                for name, value in [('source-audit.json', {}), ('franchises.json', []), ('freezes.json', {'states': [first, second]})]:
                    (root / name).write_text(json.dumps(value), encoding='utf-8')
                previous = root / 'report-data.json'
                previous.write_text('{"previous":"valid"}', encoding='utf-8')
                features = pd.DataFrame([{'slug': 'league', 'round': 10, 'h2h_id': 'player'}])
                with patch.object(analyze, 'ROOT', root), patch.object(pd, 'read_pickle', return_value=features), patch.object(analyze, 'read_squads') as sources:
                    with self.assertRaisesRegex(ValueError, 'Conflicting franchise board active/frozen state'):
                        analyze.aggregate()
                sources.assert_not_called()
                self.assertEqual(previous.read_text('utf-8'), '{"previous":"valid"}')
                self.assertFalse((root / 'decisions.json').exists())

if __name__ == '__main__':
    unittest.main()
