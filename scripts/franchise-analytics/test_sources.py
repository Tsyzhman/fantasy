"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts"""
import unittest
import tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from sources import personal_teams, profile_path, registry, squad_sources, memberships, write_cache


class SourceTests(unittest.TestCase):
    def test_parallel_cache_writes_publish_one_complete_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cache.json.gz'
            payloads = [bytes([n]) * 10000 for n in range(8)]
            with ThreadPoolExecutor(max_workers=4) as workers:
                list(workers.map(lambda payload: write_cache(path, payload), payloads))
            self.assertIn(path.read_bytes(), payloads)
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])
    def test_workbook_registry_is_complete_and_unique(self):
        value = registry()
        self.assertEqual(len(value['franchises']), 74)
        self.assertEqual(len(value['groups']), 1)
        self.assertEqual(value['groups'][0]['name'], 'шизы')
        self.assertEqual(len(value['groups'][0]['users']), 24)

    def test_personal_history_includes_every_linked_round(self):
        html = '''<div class="data">
        <a href="https://fantasy-h2h.ru/analytics/fantasy_score_dynamic/rfpl_2026/id123">график</a>
        <a href="https://fantasy-h2h.ru/analytics/fantasy_team_tour_data/123/7463/337/" title="тур 1, 26 Июл 2026">93</a>
        <a href="https://fantasy-h2h.ru/analytics/fantasy_team_tour_data/123/7465/337/" title="тур 2, 2 Авг 2026">72</a>
        <a href="https://fantasy-h2h.ru/analytics/fantasy_team_tour_data/123/7471/337/" title="тур 9, 17 Сен 2026">71</a>
        </div>'''
        self.assertEqual(personal_teams(html, {'rfpl_2026': 63}), [{'slug': 'rfpl_2026', 'cid': 337, 'team_id': '123', 'available_rounds': [1, 2, 9]}])
        self.assertEqual(personal_teams(html, {'rfpl_2026': None}), [])

    def test_shared_squad_is_fetched_once_with_explicit_memberships(self):
        team = {'team_id': '123', 'manager': 'm'}
        base = {'slug': 'rfpl_2026', 'cid': 337, 'teams': [team]}
        forms = [{**base, 'franchise': 5}, {**base, 'franchise': 5, 'personal': True}, {**base, 'franchise': -1, 'personal': True}]
        sources = squad_sources(forms)
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]['memberships'], [{'franchise': 5, 'manager': 'm', 'personal_only': False}, {'franchise': -1, 'manager': 'm', 'personal_only': True}])
        self.assertEqual(memberships({'franchise': 5, 'manager': 'm'}), [{'franchise': 5, 'manager': 'm'}])

    def test_invalid_source_paths_and_conflicting_ids_fail(self):
        for url in ['https://evil.test/h2h/viewprofile/123', 'http://fantasy-h2h.ru/h2h/viewprofile/123', 'https://fantasy-h2h.ru/h2h/viewprofile/123?x=1']:
            with self.assertRaises(ValueError):
                profile_path(url)
        self.assertEqual(profile_path('https://fantasy-h2h.ru/h2h/viewprofile/Lampard07'), '/h2h/viewprofile/Lampard07')


if __name__ == '__main__':
    unittest.main()
