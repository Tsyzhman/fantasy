"""Repeatable synthetic baseline/candidate profile, bounded to 3.5 GiB locally.

No production exports are used. The baseline source directory must be a saved
immutable checkout of scripts/franchise-analytics before the optimization.
"""
import argparse
import contextlib
import copy
import gzip
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

EVIDENCE = pathlib.Path(__file__).resolve().parent
REPO = EVIDENCE.parents[3]


def child(args):
    os.environ['FRANCHISE_DATA_DIR'] = str(args.data.resolve())
    sys.path.insert(0, str(args.code.resolve()))
    import analyze
    if args.squads:
        from sources import read_squads
        prototypes = list(read_squads(args.data))
        old = analyze.pd.read_pickle(args.data / 'source/features.pkl')
        records = old.to_dict('records')
        if args.features > len(records):
            for index in range(len(records), args.features):
                row = dict(records[index % len(old)])
                row['h2h_id'] = 'unused-' + str(index)
                records.append(row)
        analyze.pd.DataFrame(records).to_pickle(args.data / 'source/features.pkl')
        del records, old

        def sources(_):
            for index in range(args.squads):
                row = copy.deepcopy(prototypes[index % len(prototypes)])
                row['team'] = 'synthetic-' + str(index)
                yield row

        state = [{'franchise': row['franchise'], 'slug': row['slug'], 'round': row['round'], 'team': row['team'], 'active': not row['personal_only'], 'frozen': False} for row in sources(None)]
        (args.data / 'freezes.json').write_text(json.dumps({'states': state, 'events': [], 'summary': [], 'audit': [], 'basis': []}), encoding='utf-8')
        del state
        analyze.read_squads = sources
    import sync
    sync.stage(args.stage)


def measure(code, data, stage, label, squads=0, features=0):
    import psutil
    command = [sys.executable, str(pathlib.Path(__file__).resolve()), '--child', '--code', str(code), '--data', str(data), '--stage', stage, '--squads', str(squads), '--features', str(features)]
    logfile = EVIDENCE / (label + '-' + stage + '.txt')
    start, peak, samples = time.monotonic(), 0, 0
    with logfile.open('w', encoding='utf-8') as target:
        proc = subprocess.Popen(command, stdout=target, stderr=subprocess.STDOUT)
        try:
            sampled = psutil.Process(proc.pid)
            while proc.poll() is None:
                try:
                    # Windows venv python.exe is a redirector; count its real
                    # interpreter child as well as any stage descendants.
                    memories = [process.memory_info() for process in [sampled] + sampled.children(recursive=True)]
                    peak = max(peak, sum(max(memory.rss, getattr(memory, 'peak_wset', 0)) for memory in memories))
                    samples += 1
                    if peak > 3584 * 1024**2:
                        raise RuntimeError('Synthetic profile exceeded its 3.5 GiB safety bound')
                    if time.monotonic() - start > 600:
                        raise RuntimeError('Synthetic profile exceeded ten minutes')
                except psutil.NoSuchProcess:
                    pass
                time.sleep(.05)
            if proc.returncode:
                raise RuntimeError(logfile.read_text('utf-8')[-4000:])
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    result = {'label': label, 'stage': stage, 'seconds': round(time.monotonic() - start, 3), 'peak_rss_bytes': peak, 'samples': samples, 'synthetic_squads': squads, 'feature_rows': features}
    print(json.dumps(result), flush=True)
    return result


def comparable(path):
    value = json.loads(gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_text('utf-8'))
    if isinstance(value, dict):
        value.pop('generated', None)
    return value


def main(args):
    import runpy
    create = runpy.run_path(str(REPO / 'scripts/franchise-analytics/fixtures/collector_fixture.py'))['create']
    args.data.mkdir(parents=True, exist_ok=True)
    before, after = args.data / 'golden-before', args.data / 'golden-after'
    for folder in [before, after]:
        if folder.exists():
            raise ValueError('Use a fresh profile directory')
        create(folder)
    results = []
    for label, code, data in [('before', args.baseline, before), ('after', args.code, after)]:
        for stage in ['features', 'aggregate', 'enrich', 'hypotheses', 'export']:
            results.append(measure(code, data, stage, label))
    comparisons = {}
    for name in ['source-audit.json', 'report-data.json', 'validation.json', 'decisions.json', 'nonbudget-hypotheses.json', 'snapshot.json.gz']:
        left, right = comparable(before / name), comparable(after / name)
        encoded_left = json.dumps(left, ensure_ascii=False, sort_keys=True).encode()
        encoded = json.dumps(right, ensure_ascii=False, sort_keys=True).encode()
        if encoded_left != encoded:
            # Save only synthetic artifacts locally, never production payloads.
            raise AssertionError('Domain output differs: ' + name)
        comparisons[name] = {'identical': True, 'comparison': 'canonical JSON bytes; only generated omitted', 'sha256_without_generated': hashlib.sha256(encoded).hexdigest()}
    summary = {'fixture': create(args.data / 'description'), 'runtime': {'python': sys.version, 'platform': sys.platform}, 'measurements': results, 'domain_comparisons': comparisons}
    if args.profile:
        for label, code, count in [('before', args.baseline, 12000), ('after', args.code, 12000), ('after-live-scale', args.code, 61000)]:
            folder = args.data / label
            shutil.copytree(after, folder)
            results.append(measure(code, folder, 'aggregate', label + '-scale', count, 70340))
    (EVIDENCE / args.output).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'all_domain_outputs_identical': True, 'measurements': len(results)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--code', type=pathlib.Path, default=REPO / 'scripts/franchise-analytics')
    parser.add_argument('--baseline', type=pathlib.Path, default=REPO / '.tmp/wi088-baseline')
    parser.add_argument('--data', type=pathlib.Path, required=True)
    parser.add_argument('--stage', default='aggregate')
    parser.add_argument('--squads', type=int, default=0)
    parser.add_argument('--features', type=int, default=0)
    parser.add_argument('--child', action='store_true')
    parser.add_argument('--profile', action='store_true')
    parser.add_argument('--output', default='fixture-profile.json')
    options = parser.parse_args()
    if options.child:
        child(options)
    else:
        main(options)
