"""Bounded public health sampling through the production traffic switch."""
import datetime
import json
import time
import urllib.request
import sys
from pathlib import Path

expected = "0880d401519052841b7be8d0b217f83f60d46aff"
if len(sys.argv) > 1:
    expected = sys.argv[1]
deadline = time.monotonic() + 35 * 60
consecutive = 0
path = Path(__file__).with_name("availability-resume.jsonl" if len(sys.argv) > 1 else "availability.jsonl")
if len(sys.argv) > 2:
    path = Path(__file__).with_name(sys.argv[2])
with path.open("w", encoding="utf-8") as target:
    while time.monotonic() < deadline:
        start = time.monotonic()
        sample = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen("https://fantasy.tsyzhman.ru/api/health", timeout=5) as response:
                data = json.load(response)
                sample.update(status=response.status, commit=data.get("release", {}).get("commit"))
            consecutive = consecutive + 1 if sample.get("commit") == expected else 0
        except Exception as error:
            sample["error"] = type(error).__name__
            consecutive = 0
        sample["ms"] = round((time.monotonic() - start) * 1000)
        target.write(json.dumps(sample) + "\n")
        target.flush()
        if consecutive >= 3:
            print("Verified new production revision in three consecutive public samples")
            break
        time.sleep(5)
    else:
        raise SystemExit("Availability sampler deadline reached")
