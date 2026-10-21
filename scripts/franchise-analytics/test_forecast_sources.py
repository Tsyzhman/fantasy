"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#time"""
import datetime
import unittest
from forecast_sources import pre_round_snapshots

FIELDS = ['playerId', 'predictedFp', 'alternativePredictedFp', 'foontasyPoints', 'forecastCalculatedAt', 'foontasyFetchedAt']


def record(round_key, deadline, captured, value=5):
    return {'league_id': 48, 'round_key': round_key, 'first_kickoff_at': deadline, 'captured_at': captured, 'players_count': 1,
            'players': [{'playerId': 1, 'predictedFp': value, 'alternativePredictedFp': value, 'foontasyPoints': value}]}


class ForecastSourceTests(unittest.TestCase):
    def test_provider_aliases_use_the_exact_deadline_and_not_the_round_number(self):
        early = record('sports-ru:tour:10:2390', '2026-10-13T18:45:00', '2026-10-13T18:44:09', 1)
        actual = record('sports-ru:tour:11:2391', '2026-10-16T19:00:00', '2026-10-16T18:59:09', 7)
        alias = {**actual, 'round_key': 'sports-ru:tour:10:2391'}
        for rows in [[early, actual, alias], [alias, actual, early]]:
            index, metadata, invalid = pre_round_snapshots(rows, FIELDS)
            self.assertEqual(index[(48, datetime.datetime(2026, 10, 16, 19))]['1']['predictedFp'], 7)
            self.assertNotIn((48, datetime.datetime(2026, 10, 16, 18, 59)), index)
            self.assertEqual(len(metadata), 2)
            self.assertEqual(invalid, 0)

    def test_latest_pre_deadline_capture_wins_and_late_values_remain_missing(self):
        old = record('a', '2026-10-16T22:00:00+03:00', '2026-10-16T18:00:00Z', 1)
        current = record('a', '2026-10-16T19:00:00Z', '2026-10-16T18:59:00Z', 7)
        late = record('a', '2026-10-16T19:00:00Z', '2026-10-16T19:01:00Z', 99)
        current['players'][0].update(forecastCalculatedAt='2026-10-16T19:01:00Z', foontasyFetchedAt='2026-10-16T19:01:00Z')
        index, _, invalid = pre_round_snapshots([current, late, old], FIELDS)
        player = index[(48, datetime.datetime(2026, 10, 16, 19))]['1']
        self.assertIsNone(player['predictedFp'])
        self.assertIsNone(player['alternativePredictedFp'])
        self.assertIsNone(player['foontasyPoints'])
        self.assertEqual(invalid, 2)

    def test_conflicting_aliases_and_duplicate_players_fail(self):
        first = record('a', '2026-10-16T19:00:00', '2026-10-16T18:59:00')
        second = record('b', '2026-10-16T19:00:00', '2026-10-16T18:59:00', 9)
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            pre_round_snapshots([first, second], FIELDS)
        first['players'] *= 2
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            pre_round_snapshots([first], FIELDS)


if __name__ == '__main__':unittest.main()
