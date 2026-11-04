"""Read-only public availability samples during the computation/import stages.
@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime
import json
from pathlib import Path
import time
import urllib.request

root = Path(__file__).resolve().parent
deadline = time.monotonic() + 5550
samples = []
with (root / 'franchise-availability-0152.jsonl').open('x', encoding='utf-8') as output:
    while time.monotonic() < deadline:
        item = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen('https://fantasy.tsyzhman.ru/api/health', timeout=10) as response:
                body = json.load(response)
                item.update(status=response.status, release=body.get('release'))
                assert response.status == 200 and body['status'] == 'ok'
                assert body['release']['commit'] == '3e58a9f3d7d45fc9f26b815f9b9c33a80e2d4b65'
        except Exception as error:
            item['error'] = type(error).__name__
        samples.append(item)
        output.write(json.dumps(item) + '\n')
        output.flush()
        if (root / 'production-sync-0152-exit.json').exists():
            break
        time.sleep(5)
summary = {'samples': len(samples), 'errors': sum('error' in item for item in samples),
           'from': samples[0]['at'], 'to': samples[-1]['at'],
           'scope': 'Whole controlled cycle from before acquisition to process exit; inspect exit/stages for import success.'}
(root / 'franchise-availability-0152-summary.json').write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
print(json.dumps(summary))
