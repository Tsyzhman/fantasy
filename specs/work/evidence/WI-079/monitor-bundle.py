"""Resource evidence for the serialized operator bundle calculation/import."""
import datetime,json,pathlib,subprocess,time
container=json.loads(subprocess.check_output(['docker','container','inspect','fantasy-scout-worker']))[0]
pid=container['State']['Pid']
group=pathlib.Path(f'/proc/{pid}/cgroup').read_text().strip().split(':',2)[-1]
root=pathlib.Path('/sys/fs/cgroup')/group.lstrip('/')
peak=0
for _ in range(160):
    operation=subprocess.check_output(['docker','exec','fantasy-scout-worker','cat','/app/storage/franchises/.wi079-operation.json'],text=True)
    state=json.loads(operation)
    memory=int((root/'memory.current').read_text());peak=max(peak,memory)
    events=dict(line.split() for line in (root/'memory.events').read_text().splitlines())
    processes=subprocess.check_output(['docker','top','fantasy-scout-worker','-eo','pid,ppid,etimes,rss,args'],text=True)
    print(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memory_bytes':memory,'observed_peak_bytes':peak,'events':events,'operation':state,'processes':processes}),flush=True)
    if state['phase'] in ['complete','failed']:break
    time.sleep(10)
else:raise SystemExit('Operator bundle resource deadline reached')
