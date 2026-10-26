"""Sample separate job/worker memory, host headroom and OOM counters."""
import datetime,json,pathlib,subprocess,time
def inspect(name):return json.loads(subprocess.check_output(['docker','container','inspect',name]))[0]
job=inspect('fantasy-scout-franchises-job');worker=inspect('fantasy-scout-worker')
def group(container):
 path=pathlib.Path(f"/proc/{container['State']['Pid']}/cgroup").read_text().strip().split(':',2)[-1]
 return pathlib.Path('/sys/fs/cgroup')/path.lstrip('/')
root=group(job);worker_root=group(worker);peak=0
print(json.dumps({'configuration':{'same_worker_image':job['Image']==worker['Image'],'memory_limit':job['HostConfig']['Memory'],'memory_swap_limit':job['HostConfig']['MemorySwap'],'nano_cpus':job['HostConfig']['NanoCpus'],'ports':job['NetworkSettings']['Ports'],'mounts':[{'type':m['Type'],'destination':m['Destination'],'rw':m['RW']} for m in job['Mounts']]}}),flush=True)
for _ in range(720):
 state=json.loads(subprocess.check_output(['docker','exec','fantasy-scout-worker','cat','/app/storage/franchises/.wi079-operation.json'],text=True))
 available=next(int(x.split()[1])*1024 for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
 if state['phase'] in ['complete','failed']:
  print(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation':state,'observed_peak_bytes':peak,'host_available_bytes':available}),flush=True);break
 try:
  memory=int((root/'memory.current').read_text());events=dict(line.split() for line in (root/'memory.events').read_text().splitlines());peak=max(peak,memory)
 except FileNotFoundError:
  time.sleep(.5);continue
 processes=subprocess.run(['docker','top','fantasy-scout-franchises-job','-eo','pid,ppid,etimes,rss,args'],capture_output=True,text=True).stdout
 print(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memory_bytes':memory,'observed_peak_bytes':peak,'worker_memory_bytes':int((worker_root/'memory.current').read_text()),'events':events,'operation':state,'host_available_bytes':available,'processes':processes}),flush=True)
 time.sleep(5)
else:raise SystemExit('Isolated job monitor deadline reached')
