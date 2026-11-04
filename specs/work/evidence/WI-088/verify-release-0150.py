"""Read-only deployed revision/source/protected-process verification.
@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime
import json
import pathlib
import subprocess
import urllib.request

expected = '1c9264f07f6b508a074232811f69b1d9aae87eb4'
release = pathlib.Path('/var/www/fantasy-scout-current').resolve(strict=True)
assert release.parent == pathlib.Path('/var/www/fantasy-scout-releases')
names = ['name', 'version', 'commit', 'tree', 'runtime-image-id', 'ci-runtime-image-id']
markers = {name: (release / ('.release-' + name)).read_text().strip() for name in names}
assert markers['commit'] == expected and markers['version'] == '0.3.150'
containers = json.loads(subprocess.check_output(['docker', 'inspect', 'fantasy-scout-web', 'fantasy-scout-worker', 'fantasy-scout-postgres'], text=True))
safe = []
for value in containers:
    state = value['State']
    revision = (value['Config'].get('Labels') or {}).get('org.opencontainers.image.revision')
    assert state['Status'] == 'running' and not state['OOMKilled'] and value['RestartCount'] == 0
    assert state.get('Health', {}).get('Status') == 'healthy'
    if value['Name'] != '/fantasy-scout-postgres':
        assert revision == expected and value['Image'] == markers['runtime-image-id']
    else:
        assert state['StartedAt'] == '2026-08-19T13:45:47.229418796Z'
    safe.append({'name': value['Name'], 'image': value['Image'], 'revision': revision,
                 'status': state['Status'], 'health': state['Health']['Status'],
                 'oom': state['OOMKilled'], 'restarts': value['RestartCount'], 'startedAt': state['StartedAt']})
workers = subprocess.check_output(['docker', 'ps', '--filter', 'name=fantasy-scout-worker', '--format', '{{.Names}}'], text=True).splitlines()
assert workers == ['fantasy-scout-worker']
runtime = json.loads(subprocess.check_output(['docker', 'exec', 'fantasy-scout-web', 'node', '-e', "console.log(JSON.stringify({node:process.version,next:require('next/package.json').version,react:require('react/package.json').version}))"], text=True))
assert runtime['node'] == 'v24.22.2'
expected_files = {
    'scripts/franchise-analytics/sources.py': '3a6006952f11ab7cd23ced63dc62d6497818af3d53bb227ccc3372677447d2a2',
    'scripts/franchise-analytics/freezes.py': '43d140fcc28304219c750ec2f085440dd66f9335c530b55c5f00727d4750b913',
}
lines = subprocess.check_output(['docker', 'exec', 'fantasy-scout-worker', 'sha256sum', *expected_files], text=True).splitlines()
actual_files = {line.split()[1]: line.split()[0] for line in lines}
assert actual_files == expected_files
with urllib.request.urlopen('https://fantasy.tsyzhman.ru/api/health', timeout=12) as response:
    assert response.status == 200
    health = json.load(response)
assert health['status'] == 'ok' and health['release'] == {'version': '0.3.150', 'commit': expected}
print(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'markers': markers,
                  'runtime': runtime, 'containers': safe, 'publicHealth': health, 'workerSourceSha256': actual_files,
                  'verification': 'Public/source/image identities and committed Python blobs match. Canonical promoter independently binds CI manifest and runtime config identities.'}, indent=2))
