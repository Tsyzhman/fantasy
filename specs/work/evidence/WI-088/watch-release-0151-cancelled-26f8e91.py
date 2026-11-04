"""Bounded public availability evidence; never changes application data.
@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime
from html.parser import HTMLParser
import json
import pathlib
import sys
import time
import urllib.request

origin = 'https://fantasy.tsyzhman.ru'
expected = '26f8e913808dcf7950f8b470c43c879f714ffe86'
old = '1c9264f07f6b508a074232811f69b1d9aae87eb4'
destination = pathlib.Path(sys.argv[1]).resolve(strict=True)

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.styles = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        href = values.get('href', '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and href.startswith('/_next/static/'):
            self.styles.append(href)

def request(path):
    with urllib.request.urlopen(urllib.request.Request(origin + path, headers={'User-Agent': 'fantasy-release-audit/0.3.151'}), timeout=12) as response:
        return response.status, response.read(2 * 1024**2)

status, html = request('/')
parser = Assets()
parser.feed(html.decode('utf-8'))
assert status == 200 and parser.styles
asset = parser.styles[0]
deadline = time.monotonic() + 4200
samples = errors = consecutive = 0
revisions = set()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
with (destination / 'release-availability-0151.jsonl').open('x', encoding='utf-8') as log:
    while time.monotonic() < deadline and consecutive < 20:
        sample = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            code, body = request('/api/health')
            health = json.loads(body)
            revision = health.get('release', {}).get('commit')
            asset_status, asset_body = request(asset)
            valid = code == 200 and health.get('status') == 'ok' and revision in (old, expected) and asset_status == 200 and len(asset_body) > 0
            sample.update({'health': code, 'revision': revision, 'oldAssetStatus': asset_status, 'ok': valid})
            revisions.add(revision)
            consecutive = consecutive + 1 if valid and revision == expected else 0
        except Exception as error:
            sample.update({'ok': False, 'error': type(error).__name__})
            consecutive = 0
        samples += 1
        errors += not sample['ok']
        log.write(json.dumps(sample) + '\n')
        log.flush()
        if samples % 12 == 0:
            print(json.dumps({'samples': samples, 'errors': errors, 'consecutiveNewRevision': consecutive}), flush=True)
        if consecutive < 20:
            time.sleep(5)
summary = {'started': started, 'expectedCommit': expected, 'oldCommit': old,
           'oldAsset': asset, 'samples': samples, 'errors': errors,
           'consecutiveNewRevision': consecutive, 'revisions': sorted(x for x in revisions if x)}
(destination / 'release-availability-0151-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary), flush=True)
raise SystemExit(0 if consecutive == 20 and errors == 0 else 1)
