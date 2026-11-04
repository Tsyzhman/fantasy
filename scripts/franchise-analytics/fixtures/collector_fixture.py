"""Deterministic collector fixture: no downloaded or personal data.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#data
@spec spec://modules/franchises/FEAT-005-franchise-analytics#time
"""
import datetime as dt
import gzip
import json
import pathlib


def create(root):
    root = pathlib.Path(root)
    source = root / 'source'
    (source / 'squads').mkdir(parents=True, exist_ok=True)
    (source / 'http').mkdir(exist_ok=True)

    def save(name, value):
        (root / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    def export(name, rows):
        with gzip.open(source / (name + '.jsonl.gz'), 'wt', encoding='utf-8') as target:
            for row in rows:
                target.write(json.dumps(row, ensure_ascii=False) + '\n')

    leagues, matches, stats, points, mapping, planning, current, current_players, foontasy, team_stats = ([] for _ in range(10))
    for league_index, (slug, league_id) in enumerate([('epl_2026', 47), ('rfpl_2026', 63)]):
        rounds = []
        for rn in range(1, 5):
            date = dt.datetime(2026, 10, 1) + dt.timedelta(days=(rn - 1) * 7)
            mid = league_index * 1000 + rn
            rounds.append({'round': rn, 'tour': mid, 'index': rn, 'matches': [{'date': f'{date.day} Окт 2026, 15:00', 'finished': rn < 4, 'sports_match_id': str(mid)}]})
            matches.append({'id': mid, 'league_id': league_id, 'season': '2026/2027', 'round': rn, 'home_team_id': 1, 'away_team_id': 2, 'home_score': 1, 'away_score': 0, 'finished': rn < 4, 'cancelled': False, 'match_date': date.isoformat() + 'Z'})
            team_stats.extend({'match_id': mid, 'team_id': tid, 'xg': 0.7 + tid / 10} for tid in [1, 2])
            players, forecasts = [], []
            for pid in range(1, 49):
                core = league_index * 1000 + pid
                pos = ['Вр', 'Зщ', 'Пз', 'Нп'][(pid - 1) % 4]
                mapping.append({'league_id': league_id, 'provider_player_id': str(pid), 'player_id': core}) if rn == 1 else None
                players.append({'id': str(pid), 'name': f'Player {pid}', 'sport_team_id': str(1 + pid % 2), 'amplua_id': pos, 'popularity_h2h': str(pid % 35 + rn / 10), 'popularity': str(pid % 50), 'popularity_captain': str(pid % 12), 'popularity_h2h_delta': str((pid + rn) % 8 - 2)})
                forecasts.append({'playerId': core, 'providerPlayerId': str(pid), 'name': f'Player {pid}', 'position': pos, 'teamName': f'Team {pid % 2}', 'price': float(5 + pid % 8), 'predictedFp': None if pid % 13 == 0 else pid % 7 + 1.25, 'alternativePredictedFp': pid % 9 + 0.75, 'foontasyPoints': None if pid % 5 == 0 else pid % 6 + 2.5, 'expectedMinutes': 70.0 + pid % 20, 'forecastCalculatedAt': (date - dt.timedelta(hours=1)).isoformat() + 'Z', 'foontasyFetchedAt': (date - dt.timedelta(hours=2)).isoformat() + 'Z', 'fixtures': ['A'], 'fixtureDifficulties': [pid % 5 + 1], 'forecastModelVersion': 'fixture'})
                foontasy.append({'league_id': league_id, 'round_number': rn, 'source_player_id': str(pid), 'player_id': core, 'foontasy_points': pid % 6 + 2.5, 'captured_at': (date - dt.timedelta(minutes=20)).isoformat() + 'Z', 'source_round_number': rn, 'position': pos})
            save(f'source/players-{slug}-{rn}.json', players)
            planning.append({'league_id': league_id, 'round_key': str(rn), 'first_kickoff_at': date.isoformat() + 'Z', 'captured_at': (date - dt.timedelta(minutes=30)).isoformat() + 'Z', 'players_count': len(forecasts), 'players': forecasts})
            if rn == 2:
                planning.append({**planning[-1], 'round_key': 'alias-2'})
            if rn == 4:
                current.append({'id': f'current-{league_id}', 'league_id': league_id, 'calculated_at': date.isoformat() + 'Z', 'revision': 'fixture', 'players_count': len(forecasts)})
                current_players.extend({'snapshot_id': f'current-{league_id}', 'player_id': p['playerId'], 'payload': p} for p in forecasts)
        leagues.append({'slug': slug, 'league_id': league_id, 'rounds': rounds})
        for game in range(-12, 5):
            mid = league_index * 1000 + game if game > 0 else 10000 + league_index * 1000 + game
            date = dt.datetime(2026, 10, 1) + dt.timedelta(days=(game - 1) * 7)
            for pid in range(1, 49):
                core = league_index * 1000 + pid
                row = {'match_id': mid, 'player_id': core, 'match_date': date.isoformat() + 'Z', 'league_id': league_id, 'season': '2026/2027' if game > 0 else '2025/2026', 'minutes': 90 if pid % 11 else 59, 'xg': 0.1 * (pid % 4), 'xa': 0.05 * (pid % 3), 'goals': pid % 3 == 0, 'assists': pid % 5 == 0, 'recoveries': 5, 'saves': 3, 'yellow_cards': 0, 'red_cards': 0, 'team_id': 1 + pid % 2, 'opponent_team_id': 2 - pid % 2}
                if game == 2 and pid == 1:
                    row['xg'] = None
                stats.append(row)
                points.append({'match_id': mid, 'player_id': core, 'ruleset_id': 1, 'points': float((pid + game) % 10)})
    save('leagues.json', leagues)
    save('franchises.json', [{'id': fid, 'name': f'Group {fid}', 'roster': 8, 'kind': 'virtual' if fid < 0 else 'franchise'} for fid in [1, 2, 3, -1]])
    names, states = [], []
    for fid in [1, 2, 3]:
        for league in leagues:
            for rd in league['rounds']:
                for team in range(8):
                    slug, rn = league['slug'], rd['round']
                    tid = str(fid * 100 + team)
                    members = [{'franchise': fid, 'manager': f'Manager {fid}-{team}', 'personal_only': False}]
                    if fid == 1 and team == 0:
                        members.append({'franchise': -1, 'manager': 'Personal manager', 'personal_only': True})
                    players = []
                    for slot in range(15):
                        pid = (slot + team + fid * 3 + rn) % 48 + 1
                        classes = (['reserve'] if slot >= 11 else []) + (['is_captain'] if slot == 0 else []) + (['in'] if rn > 1 and slot % 4 == 0 else [])
                        score = float(pid % 8 - 1) * (2 if slot == 0 else 1)
                        players.append({'id': str(pid), 'sports_id': str(pid), 'name': f'Player {pid}', 'class': classes, 'score': score})
                    missing = fid == 3 and team == 7 and rn == 3
                    name = f'{slug}-{tid}-{rn}.json'
                    save('source/squads/' + name, {'slug': slug, 'round': rn, 'team': tid, 'franchise': fid, 'manager': members[0]['manager'], 'memberships': members, 'players': [] if missing else players, 'lineup_missing': missing, 'url': f'https://fantasy-h2h.ru/fixture/{tid}/{rn}'})
                    names.append(name)
                    states.append({'franchise': fid, 'slug': slug, 'round': rn, 'team': tid, 'active': team < 6, 'frozen': team == 6})
    save('squad-index.json', names)
    save('freezes.json', {'states': states, 'events': [], 'summary': [], 'audit': [], 'basis': []})
    with gzip.open(source / 'http/fixture.json.gz', 'wt', encoding='utf-8') as target:
        json.dump({'url': 'https://fantasy-h2h.ru/fixture', 'fetchedAt': '2026-10-22T00:00:00Z', 'body': '<html>fixture</html>'}, target)
    for name, rows in [('matches', matches), ('stats', stats), ('points', points), ('price-mapping', mapping), ('planning', planning), ('current', current), ('current-players', current_players), ('foontasy', foontasy), ('team-stats', team_stats)]:
        export(name, rows)
    return {'source_squads': len(names), 'observations': len(names) + 8, 'players': 48, 'leagues': 2, 'rounds': 8}


if __name__ == '__main__':
    import sys
    print(json.dumps(create(sys.argv[1])))
