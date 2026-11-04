"""Read-only final project process/cache/resource inventory; no secret values.
@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime, json, pathlib, subprocess

def run(*args):
 p=subprocess.run(args,capture_output=True,text=True,timeout=30)
 return {'code':p.returncode,'stdout':p.stdout.strip(),'stderr':p.stderr.strip()}
names=run('docker','ps','-a','--filter','name=fantasy-scout','--format','{{.Names}}')['stdout'].splitlines()
safe=[]
for c in json.loads(subprocess.check_output(['docker','inspect',*names],text=True)):
 env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
 safe.append({'name':c['Name'],'image':c['Image'],'revision':(c['Config'].get('Labels') or {}).get('org.opencontainers.image.revision'),'status':c['State']['Status'],'health':c['State'].get('Health',{}).get('Status'),'startedAt':c['State']['StartedAt'],'oom':c['State']['OOMKilled'],'restarts':c['RestartCount'],'memoryLimit':c['HostConfig']['Memory'],'safeOverrides':{k:env.get(k) for k in ('FRANCHISE_USE_CACHE','FRANCHISE_RESUME_AFTER','FRANCHISE_DATA_DIR')}})
root=pathlib.Path('/var/www/fantasy-scout-current').resolve(strict=True)
source=pathlib.Path(subprocess.check_output(['docker','volume','inspect','fantasy-scout-franchises','--format','{{.Mountpoint}}'],text=True).strip())
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentRelease':str(root),'memory':run('free','-b'),'disk':run('df','-B1','/'),'containers':safe,'stats':run('docker','stats','--no-stream','--format','{{.Name}} {{.MemUsage}} {{.PIDs}}',*names),'dockerDisk':run('docker','system','df'),'timer':run('systemctl','show','fantasy-franchises.timer','--property=ActiveState,NextElapseUSecRealtime,LastTriggerUSec'),'temporaryJobEnvironmentFiles':[p.name for p in pathlib.Path('/tmp').glob('fantasy-franchises-env-*')],'artifactFiles':[{'name':p.name,'bytes':p.stat().st_size} for p in pathlib.Path('/tmp/fantasy-scout-ci-artifacts').glob('*') if p.is_file()],'sourceMarkers':{n:(source/n).exists() for n in ('.heavy-job.lock','.sync.lock','.collection.lock','snapshot.json.gz.tmp')},'releaseDirectories':[p.name for p in root.parent.iterdir() if p.is_dir()],'backupFiles':[{'name':p.name,'bytes':p.stat().st_size} for p in pathlib.Path('/var/backups/fantasy-scout').glob('*.dump')]},indent=2))
