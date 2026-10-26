"""Exact pre-deadline forecast scopes across provider round aliases.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#time
"""
import datetime


def timestamp(value):
    if not value:
        return None
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return parsed


def pre_round_snapshots(records, fields):
    snapshots, metadata, invalid = {}, {}, 0
    for record in records:
        cutoff, captured = timestamp(record['first_kickoff_at']), timestamp(record['captured_at'])
        if cutoff is None or captured is None:
            raise ValueError('Missing planning snapshot deadline')
        if captured > cutoff:
            invalid += 1
            continue
        key = (record['league_id'], cutoff)
        previous = metadata.get(key)
        if previous and timestamp(previous['captured_at']) > captured:
            continue
        players = {}
        for original in record['players']:
            player = {name: original.get(name) for name in fields}
            forecast_at = timestamp(player.get('forecastCalculatedAt'))
            if forecast_at and forecast_at > cutoff:
                player['predictedFp'] = player['alternativePredictedFp'] = None
                invalid += 1
            foontasy_at = timestamp(player.get('foontasyFetchedAt'))
            if foontasy_at and foontasy_at > cutoff:
                player['foontasyPoints'] = None
            identity = str(player['playerId'])
            if identity in players:
                raise ValueError('Duplicate planning snapshot player')
            players[identity] = player
        if previous and timestamp(previous['captured_at']) == captured:
            if snapshots[key] != players:
                raise ValueError('Conflicting planning snapshot aliases at the same deadline')
            if previous['round_key'] <= record['round_key']:
                continue
        snapshots[key] = players
        metadata[key] = {name: record[name] for name in ['league_id', 'round_key', 'first_kickoff_at', 'captured_at', 'players_count']}
    return snapshots, [metadata[key] for key in sorted(metadata)], invalid
