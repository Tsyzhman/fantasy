#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#runtime"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile


def site_bounds(source):
    matches = list(re.finditer(r"(?m)^fantasy\.tsyzhman\.ru[ \t]*\{", source))
    if len(matches) != 1:
        raise ValueError("Expected exactly one Fantasy Scout site block")
    start = matches[0].start()
    opening = matches[0].end() - 1
    depth, quote, escaped, comment = 0, None, False, False
    for index in range(opening, len(source)):
        char = source[index]
        if comment:
            comment = char != "\n"
            continue
        if escaped:
            escaped = False
            continue
        if quote:
            if char == "\\" and quote == '"':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ('"', '`'):
            quote = char
        elif char == "#":
            comment = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise ValueError("Fantasy Scout site block is incomplete")


def upstream_match(source):
    start, end = site_bounds(source)
    matches = list(re.finditer(
        r"(?m)^[ \t]*reverse_proxy[ \t]+127\.0\.0\.1:(300[01])(?=[ \t]*(?:\{|$))",
        source[start:end],
    ))
    if len(matches) != 1:
        raise ValueError("Expected one bounded Fantasy Scout loopback upstream")
    return start, matches[0]


def current_port(source):
    return int(upstream_match(source)[1].group(1))


def render_upstream(source, old_port, new_port):
    if old_port not in (3000, 3001) or new_port not in (3000, 3001) or old_port == new_port:
        raise ValueError("Traffic must switch between the two allowed ports")
    start, match = upstream_match(source)
    if int(match.group(1)) != old_port:
        raise ValueError("Serving upstream differs from the expected old port")
    left, right = start + match.start(1), start + match.end(1)
    return source[:left] + str(new_port) + source[right:]


def write_candidate(path, data, original_stat):
    fd, name = tempfile.mkstemp(prefix=".fantasy-scout-caddy-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), original_stat.st_mode & 0o777) if hasattr(os, "fchmod") else None
            if hasattr(os, "fchown"):
                os.fchown(stream.fileno(), original_stat.st_uid, original_stat.st_gid)
        return Path(name)
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise


def caddy_command(arguments):
    subprocess.run(["caddy", *arguments], check=True, timeout=30,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def switch_upstream(path, old_port, new_port, run=caddy_command):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Caddyfile must be a regular file")
    original, original_stat = path.read_bytes(), path.stat()
    replacement = render_upstream(original.decode("utf-8"), old_port, new_port).encode("utf-8")
    candidate = write_candidate(path, replacement, original_stat)
    try:
        run(["validate", "--config", str(candidate), "--adapter", "caddyfile"])
        if path.read_bytes() != original:
            raise RuntimeError("Caddyfile changed concurrently; traffic was not switched")
        os.replace(candidate, path)
        try:
            run(["reload", "--config", str(path), "--adapter", "caddyfile"])
        except BaseException:
            if path.read_bytes() != replacement:
                raise RuntimeError("Caddyfile changed after reload failure; inspect routing")
            restored = write_candidate(path, original, original_stat)
            os.replace(restored, path)
            run(["reload", "--config", str(path), "--adapter", "caddyfile"])
            raise RuntimeError("Caddy reload failed; original upstream was restored")
    finally:
        candidate.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current-port", action="store_true")
    parser.add_argument("--from-port", type=int, choices=(3000, 3001))
    parser.add_argument("--to-port", type=int, choices=(3000, 3001))
    args = parser.parse_args()
    path = Path("/etc/caddy/Caddyfile")
    if args.current_port:
        print(current_port(path.read_text(encoding="utf-8")))
        return
    if args.from_port is None or args.to_port is None:
        parser.error("Both switch ports are required")
    import fcntl
    with open("/var/lock/fantasy-scout-web-routing.lock", "a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        switch_upstream(path, args.from_port, args.to_port)
    print(f"TRAFFIC_SWITCH={args.from_port}->{args.to_port}")


if __name__ == "__main__":
    main()
