"""One-time audited cleanup after the failed November 4 acquisition.

Never removes source records or the published snapshot. Requires the common lock.
@spec spec://common/INFRA-006-continuous-deployment#heavy-jobs
"""
import datetime
import fcntl
import json
import pathlib
import stat
import time

root = pathlib.Path('/app/storage/franchises').resolve(strict=True)
assert str(root) == '/app/storage/franchises'
expected = {
    'source/features.pkl': 30200031,
    'source/squad-metrics.pkl': 35489362,
    'source/decisions.pkl': 403467443,
    'source/purchases.pkl': 95372852,
    'decisions.json': 478913056,
}
cutoff = datetime.datetime(2026, 11, 4, tzinfo=datetime.timezone.utc).timestamp()
lock = root / '.heavy-job.lock'
with lock.open('r+') as handle:
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(json.dumps({'deleted': False, 'reason': 'heavy job lock busy'}))
        raise SystemExit(77)
    lock_inode = lock.stat().st_ino
    assert not any((root / name).exists() for name in ('.sync.lock', '.collection.lock'))
    selected = []
    for relative, size in expected.items():
        path = root / relative
        info = path.lstat()
        assert stat.S_ISREG(info.st_mode) and not path.is_symlink()
        assert path.resolve(strict=True).is_relative_to(root)
        assert info.st_size == size and info.st_mtime < cutoff
        selected.append((path, info))
    expired = []
    age_cutoff = time.time() - 30 * 86400
    for path in (root / 'source/http').glob('*.json.gz'):
        info = path.lstat()
        assert stat.S_ISREG(info.st_mode) and not path.is_symlink()
        assert path.resolve(strict=True).is_relative_to(root / 'source/http')
        if info.st_mtime < age_cutoff:
            expired.append((path, info))
    assert len(expired) <= 10000 and sum(s.st_size for _, s in expired) <= 100 * 1024**2
    for path, info in selected + expired:
        current = path.lstat()
        assert (current.st_ino, current.st_mtime_ns, current.st_size) == (info.st_ino, info.st_mtime_ns, info.st_size)
    for path, _ in selected + expired:
        path.unlink()
    assert lock.stat().st_ino == lock_inode
    assert (root / 'snapshot.json.gz').is_file()
    print(json.dumps({
        'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'deleted': True,
        'intermediates': [str(p.relative_to(root)) for p, _ in selected],
        'intermediateBytes': sum(s.st_size for _, s in selected),
        'expiredCacheFiles': len(expired),
        'expiredCacheBytes': sum(s.st_size for _, s in expired),
        'kernelLockPreserved': True,
    }))
