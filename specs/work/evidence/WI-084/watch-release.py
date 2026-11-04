"""Bounded public availability evidence; no credentials or application writes.

@spec spec://common/INFRA-006-continuous-deployment#observability
"""
import datetime
import json
from pathlib import Path
import re
import sys
import time
import urllib.request

expected = sys.argv[1]
if not re.fullmatch(r"[a-f0-9]{40}", expected):
    raise SystemExit("Expected exact commit SHA")
base = "https://fantasy.tsyzhman.ru"
folder = Path(__file__).parent
with urllib.request.urlopen(base + "/login", timeout=10) as response:
    html = response.read().decode("utf-8")
assets = re.findall(r'(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"', html)
old_asset = next(path for path in assets if path.startswith("/_next/static/"))
deadline = time.monotonic() + 45 * 60
samples = []
consecutive = 0
with (folder / "release-availability.jsonl").open("w", encoding="utf-8") as target:
    while time.monotonic() < deadline:
        started = time.monotonic()
        sample = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=5) as response:
                sample.update(status=response.status, release=json.load(response).get("release"))
            consecutive = consecutive + 1 if sample.get("release", {}).get("commit") == expected else 0
            if consecutive:
                with urllib.request.urlopen(base + old_asset, timeout=5) as response:
                    sample["oldAssetStatus"] = response.status
        except Exception as error:
            sample["error"] = type(error).__name__
            consecutive = 0
        sample["ms"] = round((time.monotonic() - started) * 1000)
        samples.append(sample)
        target.write(json.dumps(sample) + "\n")
        target.flush()
        if consecutive >= 20:
            break
        time.sleep(2)
summary = {"expectedCommit": expected, "oldAsset": old_asset,
           "samples": len(samples), "errors": sum("error" in item for item in samples),
           "consecutiveNewRevision": consecutive,
           "revisions": sorted({item["release"]["commit"] for item in samples if item.get("release")})}
(folder / "release-availability-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary))
if consecutive < 20 or summary["errors"]:
    raise SystemExit(1)
