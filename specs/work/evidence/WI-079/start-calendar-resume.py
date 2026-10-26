"""Start exactly one resumed acquisition after exact immutable release verification."""
import datetime
import json
import pathlib
import subprocess
import time
import urllib.request

expected='6da22c0c23a85066f847750a3ecbd69807cbf37f'
checkpoint='2026-10-21T08:08:16Z'
cutoff=datetime.datetime.fromisoformat(checkpoint.replace('Z','+00:00'))
if datetime.datetime.now(datetime.timezone.utc)-cutoff>datetime.timedelta(hours=3):
    raise SystemExit('Recovery checkpoint expired; refuse stale resume')
with urllib.request.urlopen('https://fantasy.tsyzhman.ru/api/health',timeout=10) as response:
    health=json.load(response)
if health['release']['commit']!=expected:
    raise SystemExit('Public revision differs')
if pathlib.Path('/var/www/fantasy-scout-current/.release-commit').read_text().strip()!=expected:
    raise SystemExit('Release manifest differs')
container=json.loads(subprocess.check_output(['docker','container','inspect','fantasy-scout-worker']))[0]
environment=dict(item.split('=',1) for item in container['Config']['Env'] if '=' in item)
if environment.get('APP_RELEASE_COMMIT')!=expected or container['State'].get('OOMKilled') or container['RestartCount']:
    raise SystemExit('Worker revision/state differs')
unit='fantasy-franchises.service'
state=subprocess.check_output(['systemctl','show',unit,'-p','ActiveState','--value'],text=True).strip()
if state in ['active','activating','reloading']:
    raise SystemExit('Collector already active; refuse duplicate start')
subprocess.run(['docker','exec','fantasy-scout-worker','sh','-c','test ! -e /app/storage/franchises/.sync.lock && test ! -e /app/storage/franchises/.collection.lock'],check=True)
override=pathlib.Path('/run/systemd/system/fantasy-franchises.service.d/wi-079-recovery.conf')
if override.exists() or override.is_symlink():
    raise SystemExit('Unexpected existing recovery override')
body='[Service]\nEnvironment=FRANCHISE_RESUME_AFTER='+checkpoint+'\n'
subprocess.run(['sudo','-n','mkdir','-p',str(override.parent)],check=True)
subprocess.run(['sudo','-n','tee',str(override)],input=body.encode(),stdout=subprocess.DEVNULL,check=True)
try:
    subprocess.run(['sudo','-n','systemctl','daemon-reload'],check=True)
    subprocess.run(['sudo','-n','systemctl','start','--no-block',unit],check=True)
    for _ in range(30):
        pid=int(subprocess.check_output(['systemctl','show',unit,'-p','MainPID','--value'],text=True).strip())
        if pid:break
        time.sleep(.2)
    else:raise SystemExit('Collector failed to start')
    inherited=subprocess.check_output(['sudo','-n','cat',f'/proc/{pid}/environ']).split(bytes([0]))
    if ('FRANCHISE_RESUME_AFTER='+checkpoint).encode() not in inherited:
        raise SystemExit('Collector did not inherit the checkpoint')
finally:
    if override.is_symlink() or override.read_text()!=body:
        raise SystemExit('Recovery override changed; refuse cleanup')
    subprocess.run(['sudo','-n','rm','--',str(override)],check=True)
    subprocess.run(['sudo','-n','systemctl','daemon-reload'],check=True)
subprocess.run(['sudo','-n','systemctl','enable','--now','fantasy-franchises.timer'],check=True)
print(json.dumps({'commit':expected,'main_pid':pid,'resume_after':checkpoint,'temporary_override_removed':not override.exists(),'timer_enabled':True}))
