"""Bounded production aggregates only; no payloads, collectors, or remote writes."""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
REMOTE = r'''
import datetime,json,pathlib,subprocess
def run(args):
    return subprocess.check_output(args,text=True,timeout=30)
def inspect(name):
    item=json.loads(run(['docker','inspect',name]))[0]
    return {'name':name,'image':item['Image'],'pid':item['State']['Pid'],'oom':item['State']['OOMKilled'],'restarts':item['RestartCount'],'limit':item['HostConfig']['Memory']}
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'meminfo':{line.split(':')[0]:int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.split(':')[0] in ['MemTotal','MemAvailable','SwapTotal']},'containers':[inspect(name) for name in ['fantasy-scout-worker','fantasy-scout-postgres']]}
result['job_names']=run(['docker','ps','--filter','name=fantasy-scout-franchises-job','--format','{{.Names}}']).splitlines()
code="""
import json,pathlib,struct
root=pathlib.Path('/app/storage/franchises')
files={}
for p in sorted((root/'source').glob('*')):
 if p.is_file():
  value={'bytes':p.stat().st_size}
  if p.name.endswith('.gz'):
   with p.open('rb') as f:f.seek(-4,2);value['gzip_isize_mod_4gib']=struct.unpack('<I',f.read(4))[0]
  files[p.name]=value
counts={}
for folder,pattern in [('squads','*.json'),('http','*.json.gz')]:
 entries=list((root/'source'/folder).glob(pattern));counts[folder]={'files':len(entries),'bytes':sum(p.stat().st_size for p in entries)}
index=json.loads((root/'squad-index.json').read_text())
audit=json.loads((root/'source-audit.json').read_text())
validation=json.loads((root/'validation.json').read_text())
report=json.loads((root/'report-data.json').read_text())
print(json.dumps({'files':files,'counts':counts,'squad_index':{'total':len(index),'unique':len(set(index))},'audit':{k:audit.get(k) for k in ['stats_total','stats_relevant','stats_duplicates','stats_seasons','features','mapped_features']},'validation':validation.get('checks'),'report':{'generated':report.get('generated'),'n_squads':report.get('n_squads'),'n_decisions':report.get('n_decisions'),'n_buys':report.get('n_buys'),'acquisition':report.get('acquisition')},'snapshot_bytes':(root/'snapshot.json.gz').stat().st_size,'locks':{name:(root/name).exists() for name in ['.sync.lock','.collection.lock','.heavy-job.lock']}}))
"""
result['sources']=json.loads(run(['docker','exec','fantasy-scout-worker','/opt/franchises/bin/python','-c',code]))
print(json.dumps(result,indent=2))
'''

if __name__ == '__main__':
    result = subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'deploy', 'python3 -'],
                            input=REMOTE, text=True, capture_output=True, timeout=55)
    if result.returncode:
        raise SystemExit(result.stderr[-1000:])
    data = json.loads(result.stdout)
    (ROOT / 'production-aggregates-before.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(data, indent=2))
