"""Each verified H2H board owns its states even when football rounds coincide.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#freezes
"""
import contextlib
import copy
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import freezes


class FreezeBoardTests(unittest.TestCase):
    def test_verifying_two_duels_in_one_round_never_mutates_the_other_boards_states(self):
        form_url = 'https://fantasy-h2h.ru/form/fixture'
        a_url = 'https://fantasy-h2h.ru/h2h/team_match_data/100'
        b_url = 'https://fantasy-h2h.ru/h2h/team_match_data/200'

        def summary_cell(team, active, frozen, score):
            classes = 'match exchange' if frozen else 'match'
            board = f'<span class="game_number">{active.index(team) + 1}</span>' if team in active else ''
            return f'<td class="{classes}"><a class="match_result finished" data-tour_id="300" data-score="{score} - 1">{score}</a>{board}</td>'

        first_active, second_active = [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7]
        rows = []
        for team in range(1, 8):
            cells = summary_cell(team, first_active, team == 7, team * 10) + summary_cell(team, second_active, team == 6, team * 100)
            rows.append(f'<tr data-player_id="{team}"><td class="uname"><a href="https://fantasy-h2h.ru/team/{team}">Fixture {team}</a></td>{cells}</tr>')
        form = f'<div class="players_list"><table><tr class="header"><td>Manager</td><td><a href="{a_url}">1</a></td><td><a href="{b_url}">2</a></td></tr><tbody>{"".join(rows)}</tbody></table></div>'

        def board(active, reserve, multiplier):
            def person(team, is_reserve=False):
                return f'<li class="{"reserve" if is_reserve else ""}"><a class="uname" href="https://fantasy-h2h.ru/team/{team}">Fixture</a><span class="score">{team * multiplier}</span></li>'
            own = ''.join(person(team) for team in active) + person(reserve, True)
            opponents = ''.join(person(team) for team in range(101, 107))
            return f'<div class="one_tour_roster"><table><tr><td class="column"><ul class="roster">{own}</ul></td><td class="column"><ul class="roster">{opponents}</ul></td></tr></table></div>'

        responses = {form_url: form, a_url: board(first_active, 7, 10), b_url: board(second_active, 6, 100)}
        saved = {}
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'franchise-teams.json').write_text(json.dumps([{'franchise': 1, 'slug': 'fixture', 'url': form_url}]), encoding='utf-8')
            (root / 'leagues.json').write_text(json.dumps([{'slug': 'fixture', 'rounds': [{'round': 1, 'tour': 300, 'matches': []}]}]), encoding='utf-8')
            with patch.object(freezes, 'ROOT', root), patch.object(freezes, 'IDS', [1]), patch.object(freezes, 'get', side_effect=lambda url, params=None: responses[url]), patch.object(freezes, 'save', side_effect=lambda name, value: saved.update({name: copy.deepcopy(value)})), patch.object(freezes, 'pool', side_effect=lambda fn, jobs: [fn(item) for item in jobs]), contextlib.redirect_stdout(io.StringIO()):
                freezes.main()
        result = saved['freezes.json']
        self.assertEqual(len(result['states']), 14)
        self.assertEqual(len(result['events']), 2)
        events = {event['source']: event for event in result['events']}
        for source, team, gain in [(a_url, '6', -10), (b_url, '7', 100)]:
            event = events[source]
            self.assertTrue(event['valid'] and event['board_verified'])
            self.assertEqual(event['gain'], gain)
            self.assertEqual([person['team'] for person in event['substitutes']], [team])
            self.assertTrue(all(person['source'] == source for person in event['frozen'] + event['substitutes']))
        states = {(value['source'], value['team']): value for value in result['states']}
        self.assertTrue(states[(a_url, '6')]['active'])
        self.assertFalse(states[(b_url, '6')]['active'])
        self.assertEqual(states[(a_url, '6')]['score'], 60)
        self.assertEqual(states[(b_url, '6')]['score'], 600)


if __name__ == '__main__':
    unittest.main()
