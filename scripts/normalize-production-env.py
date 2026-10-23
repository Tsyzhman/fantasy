#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#runtime"""
import argparse
import os
from pathlib import Path
import re


def normalize_environment(lines, drop=()):
    """Keep the effective final value without logging private environment data."""
    values = {}
    for line in lines:
        if not line:
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or any(c in value for c in "\r\n\0"):
            raise ValueError("Invalid production environment entry")
        if key not in drop:
            values[key] = value
    return "".join(f"{key}={value}\n" for key, value in values.items())


def main():
    parser = argparse.ArgumentParser(description="Normalize a private runtime env file without printing its values.")
    parser.add_argument("path", type=Path)
    parser.add_argument("--drop", nargs="*", default=[])
    args = parser.parse_args()
    source = args.path.read_text(encoding="utf-8")
    normalized = normalize_environment(source.splitlines(), set(args.drop))
    os.chmod(args.path, 0o600)
    args.path.write_text(normalized, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
