#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#recovery"""
import argparse
import json
from pathlib import Path
import re
import subprocess

BACKUP_ROOT = Path('/var/backups/fantasy-scout')
FULL_DUMP = re.compile(
    r'(?:pre-\d{8}T\d{6}Z-v\d+\.\d+\.\d+-[0-9a-f]{7,40}-migration'
    r'|snapshot-\d{8}T\d{6}Z-v\d+\.\d+\.\d+-[0-9a-f]{7,40})\.dump'
)


def fingerprint(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Refusing non-regular backup: {path.name}')
    stat = path.stat()
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


def verify_archive(path):
    # Read/decompress all archive blocks, without connecting to or restoring a DB.
    with path.open('rb') as source:
        result = subprocess.run(
            ['docker', 'exec', '-i', 'fantasy-scout-postgres', 'pg_restore',
             '--file=/dev/null', '--no-owner', '--no-acl', '--exit-on-error'],
            stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
    if result.returncode:
        raise ValueError(f'Full archive verification failed: {path.name}')


def prune_backups(root, apply, verify=verify_archive):
    if not root.exists():
        return {'keep': None, 'remove': [], 'removedBytes': 0, 'applied': apply}
    if root.is_symlink() or root.resolve() != root:
        raise ValueError('Refusing indirect backup root')
    dumps = sorted(root.glob('*.dump'))
    states = {path: fingerprint(path) for path in dumps}
    full = [path for path in dumps if FULL_DUMP.fullmatch(path.name)]
    if not full:
        if dumps:
            raise ValueError('No completed full database dump; preserving every backup')
        return {'keep': None, 'remove': [], 'removedBytes': 0, 'applied': apply}
    keep = max(full, key=lambda path: (states[path][3], path.name))
    verify(keep)
    for path, state in states.items():
        if fingerprint(path) != state:
            raise ValueError('Backup changed during verification; preserving every backup')
    remove = [path for path in dumps if path != keep]
    sidecars = [Path(str(path) + suffix) for path in remove
                for suffix in ('.list', '.sha256') if Path(str(path) + suffix).exists()]
    for path in sidecars:
        fingerprint(path)
    removed_bytes = sum(path.stat().st_size for path in remove + sidecars)
    if apply:
        for path in remove + sidecars:
            path.unlink()
    return {'keep': str(keep), 'verifiedBytes': keep.stat().st_size,
            'remove': [str(path) for path in remove + sidecars],
            'removedBytes': removed_bytes if apply else 0,
            'plannedBytes': removed_bytes, 'applied': apply}


def main():
    parser = argparse.ArgumentParser(description='Retain one fully verified production database dump')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prune_backups(BACKUP_ROOT, args.apply)))


if __name__ == '__main__':
    main()
