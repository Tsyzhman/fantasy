#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#migrations"""
import importlib.util
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def prepare(root, names, source, target):
    spec = importlib.util.spec_from_file_location("online_migrations", Path(__file__).with_name("check-online-migrations.py"))
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    validator.validate_migrations(root, names)
    concurrent_only = bool(names)
    for name in names:
        sql = (root / name / "migration.sql").read_text(encoding="utf-8")
        sql = re.sub(r"/\*[\s\S]*?\*/", "", sql)
        sql = re.sub(r"--[^\n]*", "", sql).strip()
        concurrent_only &= bool(re.fullmatch(r'CREATE(?:\s+UNIQUE)?\s+INDEX\s+CONCURRENTLY(?:\s+IF\s+NOT\s+EXISTS)?\s+[^;]+;', sql, re.IGNORECASE))
    line = source.read_text(encoding="utf-8").strip()
    if not line.startswith("DATABASE_URL=") or "\n" in line:
        raise ValueError("Invalid protected migration environment")
    url = urlsplit(line.split("=", 1)[1])
    if url.username != "fantasy_migrator":
        raise ValueError("Expected the protected migrator identity")
    lock_seconds = 30 if concurrent_only else 5
    query = [(k, v) for k, v in parse_qsl(url.query, keep_blank_values=True) if k != "options"]
    query.append(("options", f"-c lock_timeout={lock_seconds}s -c statement_timeout=120s"))
    value = urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))
    target.write_text("DATABASE_URL=" + value + "\n", encoding="utf-8")
    os.chmod(target, 0o600)
    return lock_seconds


if __name__ == "__main__":
    try:
        root, source, target, *names = sys.argv[1:]
        print(f"MIGRATION_LOCK_TIMEOUT_SECONDS={prepare(Path(root), names, Path(source), Path(target))}")
    except Exception:
        print("Cannot prepare the protected online migration environment", file=sys.stderr)
        sys.exit(1)
