"""Source identities and complete personal histories.

@spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts
"""
import json
import pathlib
import re
import urllib.parse
import os
import tempfile
import threading
import time
import datetime

_cache_write_lock = threading.Lock()


def calendar_rounds(document, popularity, history):
    """Use explicit live indexes or the same archived round/tour identity, never ID arithmetic."""
    indexes = {}
    for page, selector in [(document, 'select[name="filter[roster_stat][index]"] option'),
                           (popularity, 'select[name="filter[popularity_index]"] option')]:
        for option in page.select(selector):
            number = re.search(r'\d+', option.get_text(' ', strip=True))
            if number is None:
                raise ValueError('Missing calendar round number')
            rn, index = int(number[0]), int(option['value'])
            if rn <= 0 or index <= 0 or (rn in indexes and indexes[rn] != index):
                raise ValueError('Conflicting live calendar index')
            indexes[rn] = index
    rounds = {}
    for header in document.select('th[data-field^="tour_score_"]'):
        rn = int(re.search(r'\d+', header.get_text(' ', strip=True))[0])
        tour = int(header['data-field'].split('_')[-1])
        index = indexes.get(rn)
        source = 'live'
        if index is None:
            archived = history.get(rn, {})
            if archived.get('tour') != tour or type(archived.get('index')) is not int or archived['index'] <= 0:
                raise ValueError(f'No verified calendar index for round {rn}, tour {tour}')
            index, source = archived['index'], 'archive'
        value = {'round': rn, 'index': index, 'tour': tour, 'index_source': source}
        if rn in rounds and rounds[rn] != value:
            raise ValueError('Conflicting calendar round identity')
        rounds[rn] = value
    if not rounds or len({r['index'] for r in rounds.values()}) != len(rounds):
        raise ValueError('Missing or duplicate calendar indexes')
    return sorted(rounds.values(), key=lambda r: r['round'])


def resume_after(value, now=None):
    """An operator may resume only the last three hours of an interrupted acquisition."""
    if not value:
        return None
    cutoff = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if cutoff.tzinfo is None or cutoff > now or now - cutoff > datetime.timedelta(hours=3):
        raise ValueError('Franchise resume checkpoint must be within the last three hours and include a timezone')
    return cutoff


def acquired_since(value, cutoff):
    if not value or cutoff is None:
        return False
    try:
        fetched = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return fetched.tzinfo is not None and fetched >= cutoff
    except (ValueError, TypeError):
        return False


def reusable_squad(value, cutoff=None, offline=False):
    has_xi = any('prev' not in player.get('class', []) for player in value.get('players', []))
    return offline or acquired_since(value.get('fetched_at'), cutoff) or (value.get('collected_finished') and has_xi)


def require_lineup(document, tour):
    roster = document.select_one('.team_roster')
    if roster and 'football' in roster.get('class', []):
        return roster
    empty = document.select_one('.tour_data')
    if (roster and roster.get('class') == ['team_roster'] and empty is not None
            and empty.get('data-uid') == f'_{tour}'
            and empty.get('data-url') == 'https://sports.ru/fantasy/football///'
            and not document.select('li[data-player_id]')):
        return roster
    raise ValueError('Unexpected fantasy lineup response')


def profile_name(title):
    return title.removesuffix(' - H2H профиль').strip()


def board_user_id(document):
    control = document.select_one('td.uname .user_info_control[data-url_key]')
    match = re.fullmatch(r'(\d+)/\d+', control['data-url_key']) if control else None
    return match[1] if match else None


def fixture_round(document, slug, fixtures, dates, title=''):
    """Resolve a board column from actual Sports fixtures, never its phase-local number."""
    scopes = set()
    for link in document.select('.roster.this_tour li:not(.prev) [href*="/football/match/"]'):
        parsed = urllib.parse.urlsplit(link.get('href', ''))
        match = re.fullmatch(r'/football/match/(\d+)/?', parsed.path)
        if parsed.hostname in {'sports.ru', 'www.sports.ru'} and match:
            scope = fixtures.get((slug, match[1]))
            if scope is not None:
                scopes.add(scope)
    # Empty lineups still have an explicit competition date in the match title.
    date = re.search(r', (\d{2}\.\d{2}\.\d{4})$', title)
    dated = dates.get((slug, date[1]), set()) if date else set()
    if len(scopes) > 1 or len(dated) > 1 or (scopes and dated and scopes != dated):
        raise ValueError('Conflicting board fixture identity')
    return next(iter(scopes or dated), None)


def registry():
    value = json.loads(pathlib.Path(__file__).with_name('franchises.json').read_text('utf-8'))
    ids = value['franchises']
    if len(ids) != len(set(ids)) or any(type(x) is not int or x <= 0 for x in ids):
        raise ValueError('Invalid or duplicate franchise IDs')
    group_ids = set(ids)
    for group in value['groups']:
        if group['id'] in group_ids or group['id'] >= 0 or group['kind'] != 'virtual':
            raise ValueError('Invalid virtual group')
        group_ids.add(group['id'])
        profiles = [profile_path(user['profile']) for user in group['users']]
        if len(profiles) != len(set(profiles)):
            raise ValueError('Duplicate personal profile')
    return value


def profile_path(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'fantasy-h2h.ru' or not re.fullmatch(r'/h2h/viewprofile/[^/]+', parsed.path) or parsed.query or parsed.fragment:
        raise ValueError('Unexpected personal profile URL')
    return parsed.path


def personal_teams(body, leagues):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(body, 'html.parser')
    teams = {}
    for link in soup.select('a[href*="fantasy_score_dynamic/"]'):
        match = re.fullmatch(r'/analytics/fantasy_score_dynamic/([^/]+)/id(\d+)', urllib.parse.urlsplit(link['href']).path)
        if not match or leagues.get(match[1]) is None:
            continue
        slug, team = match.groups()
        container = link.find_parent('div', class_='data')
        if container is None:
            raise ValueError('Personal team has no history container')
        rounds = set()
        cids = set()
        for score in container.select('a[href*="fantasy_team_tour_data/"]'):
            path = urllib.parse.urlsplit(score['href'])
            parsed = re.fullmatch(r'/analytics/fantasy_team_tour_data/(\d+)/(\d+)/(\d+)/?', path.path)
            title = re.match(r'тур (\d+),', score.get('title', ''))
            if path.netloc != 'fantasy-h2h.ru' or not parsed or parsed[1] != team or not title:
                raise ValueError('Invalid personal round link')
            rounds.add(int(title[1]))
            cids.add(int(parsed[3]))
        if not rounds:
            continue
        if len(cids) != 1:
            raise ValueError('Conflicting personal competition identity')
        teams[(slug, team)] = {'slug': slug, 'cid': cids.pop(), 'team_id': team, 'available_rounds': sorted(rounds)}
    return list(teams.values())


def squad_sources(forms):
    """Fetch a Sports squad once, even when it belongs to several report groups."""
    sources = {}
    for form in forms:
        for team in form['teams']:
            key = (form['slug'], form['cid'], team['team_id'])
            source = sources.setdefault(key, {'slug': form['slug'], 'cid': form['cid'], 'team': team['team_id'], 'memberships': {}, 'available_rounds': set(), 'board': False})
            member = {'franchise': form['franchise'], 'manager': profile_name(team['manager']), 'personal_only': bool(form.get('personal'))}
            previous = source['memberships'].get(form['franchise'])
            if previous:
                member['personal_only'] = previous['personal_only'] and member['personal_only']
            source['memberships'][form['franchise']] = member
            source['available_rounds'].update(team.get('available_rounds', []))
            source['board'] |= not form.get('personal', False)
    for source in sources.values():
        source['memberships'] = list(source['memberships'].values())
    return list(sources.values())


def memberships(squad):
    return squad.get('memberships') or [{key: squad[key] for key in ['franchise', 'manager']}]


def read_squads(root, expand=True):
    index = root / 'squad-index.json'
    names = json.loads(index.read_text('utf-8')) if index.exists() else [p.name for p in (root / 'source/squads').glob('*.json')]
    for name in names:
        if pathlib.Path(name).name != name or not name.endswith('.json'):
            raise ValueError('Invalid squad source path')
        squad = json.loads((root / 'source/squads' / name).read_text('utf-8'))
        squad['manager'] = profile_name(squad['manager'])
        for member in squad.get('memberships', []):
            member['manager'] = profile_name(member['manager'])
        if expand:
            for member in memberships(squad):
                yield {**squad, **member}
        else:
            yield squad


def write_cache(path, payload):
    """Parallel requests never expose an incomplete cache entry."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.stem+'-', suffix='.tmp', delete=False) as target:
            temporary = pathlib.Path(target.name)
            target.write(payload)
        with _cache_write_lock:
            for attempt in range(5):
                try:
                    os.replace(temporary, path)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    time.sleep(0.01 * (attempt + 1))
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
