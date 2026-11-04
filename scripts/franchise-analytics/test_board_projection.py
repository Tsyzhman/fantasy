"""One XI with confirmed cross-duel OR roles and strict source consistency.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts
@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes
"""
import copy
import itertools
import json
import pathlib
import unittest

from analyze import validated_board_states


class BoardProjectionTests(unittest.TestCase):
    def test_real_sanitized_roles_are_order_independent_without_mutating_histories(self):
        fixture = json.loads(pathlib.Path(__file__).with_name('fixtures').joinpath('multiple-duel-roles.json').read_text('utf-8'))
        records = fixture['records']
        history = {'states': records, 'events': [{'source': records[0]['source'], 'frozen': [records[0]], 'substitutes': [records[-1]]}]}
        before = copy.deepcopy(history)
        expected = {(r['franchise'], r['slug'], r['round'], r['team']): {'active': r['active'], 'frozen': r['frozen']} for r in fixture['expected']}
        for permutation in itertools.permutations(records):
            self.assertEqual(validated_board_states(permutation), expected)
        self.assertEqual(validated_board_states(records + records), expected)
        self.assertEqual(history, before)
        self.assertTrue(expected[(441, 'ucl_2026', 2, '632180')]['active'])
        self.assertTrue(expected[(441, 'ucl_2026', 2, '632180')]['frozen'])
        for value in validated_board_states(records).values():
            for field in ['source', 'board', 'score', 'opponent_score']:
                self.assertNotIn(field, value)

    def test_same_source_contradictions_cannot_be_hidden_by_a_third_duel(self):
        base = {'franchise': 1, 'slug': 'a', 'round': 2, 'team': '123', 'source': 'board-a', 'active': False, 'frozen': False, 'board': None, 'score': 10, 'opponent_score': None, 'finished': True}
        another = {**base, 'source': 'board-b', 'active': True, 'board': 1}
        for changes in [{'active': True, 'board': 2}, {'frozen': True}, {'score': 11}, {'finished': False}, {'opponent_score': 3}]:
            for rows in [[base, another, {**base, **changes}], [{**base, **changes}, another, base]]:
                with self.subTest(changes=changes, order=rows[0]['source']), self.assertRaisesRegex(ValueError, 'within one source'):
                    validated_board_states(rows)

    def test_missing_identity_unknown_flags_and_one_board_with_both_roles_fail_closed(self):
        base = {'franchise': 1, 'slug': 'a', 'round': 2, 'team': '123', 'source': 'board', 'active': False, 'frozen': False}
        for changes in [{'source': None}, {'source': ''}, {'active': None}, {'active': 1}, {'frozen': None}, {'active': True, 'frozen': True}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validated_board_states([{**base, **changes}])


if __name__ == '__main__':
    unittest.main()
