#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#migrations"""
import hashlib
import json
from pathlib import Path
import re
import sys


def validate_migrations(root, names):
    root = root.resolve(strict=True)
    for name in names:
        if not re.fullmatch(r"[A-Za-z0-9_]+", name):
            raise ValueError("Invalid migration name")
        directory = (root / name).resolve(strict=True)
        if directory.parent != root:
            raise ValueError("Migration is outside its bounded root")
        declaration = directory / "deployment.json"
        if not declaration.is_file() or declaration.is_symlink():
            raise ValueError(f"Migration {name} has no reviewed online compatibility declaration")
        policy = json.loads(declaration.read_text(encoding="utf-8"))
        sql = directory / "migration.sql"
        if sql.is_symlink() or not sql.is_file():
            raise ValueError(f"Migration {name} SQL is not a regular file")
        checksum = hashlib.sha256(sql.read_bytes()).hexdigest()
        if not isinstance(policy, dict) or policy.get("mode") != "online" or policy.get("sqlSha256") != checksum:
            raise ValueError(f"Migration {name} is not approved for this exact online SQL")
    return len(names)


if __name__ == "__main__":
    try:
        count = validate_migrations(Path(sys.argv[1]), sys.argv[2:])
        print(f"REVIEWED_ONLINE_MIGRATIONS={count}")
    except (ValueError, OSError, IndexError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
