"""Compact live state of the verified franchise recovery."""
import json
import pathlib
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
path=pathlib.Path('specs/work/evidence/WI-079/resources-calendar.jsonl')
rows=[json.loads(x) for x in path.read_text().splitlines() if x]
last=rows[-1]
print(json.dumps({'utc':last['utc'],'worker_mib':round(last['memory_bytes']/1024**2),'peak_mib':round(last['observed_peak_bytes']/1024**2),'events':last['events'],'service':last['service'],'processes':last['processes']},ensure_ascii=False))
code=r'''
import subprocess,json
r=subprocess.run(['sudo','-n','journalctl','-u','fantasy-franchises.service','--since','2026-10-21 13:05:20','--no-pager','-o','short-iso'],capture_output=True,text=True,timeout=15)
print(chr(10).join(line[:320] for line in r.stdout.splitlines()[-4:]))
'''
r=subprocess.run(['ssh','-T','-o','BatchMode=yes','deploy','python3 -'],input=code.encode(),capture_output=True,timeout=25)
print(r.stdout.decode('utf-8','replace'));print(r.stderr.decode('utf-8','replace'))
