#!/usr/bin/env python3
"""Prepare only the operator-pinned SSH host identity; never discover trust online.

@spec spec://common/INFRA-006-continuous-deployment#contracts
"""
import ipaddress
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def require(environ, name, maximum):
    value = environ.get(name, "")
    if not value.strip():
        raise ValueError(f"{name} secret is required")
    if len(value.encode("utf-8")) > maximum or "\0" in value:
        raise ValueError(f"{name} exceeds its permitted size or contains invalid data")
    return value


def keygen(*arguments):
    result = subprocess.run(["ssh-keygen", *arguments], capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise ValueError("DEPLOY_KNOWN_HOSTS contains no valid pinned identity for the configured host and port")
    return result.stdout


def prepare_ssh(environ, directory):
    private_key = require(environ, "DEPLOY_SSH_KEY", 65536)
    host = require(environ, "DEPLOY_HOST", 253)
    known_hosts = require(environ, "DEPLOY_KNOWN_HOSTS", 16384)
    port = environ.get("DEPLOY_PORT") or "22"
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", host):
            raise ValueError("DEPLOY_HOST must be one plain hostname or IP address")
    if not re.fullmatch(r"[0-9]{1,5}", port) or not 1 <= int(port) <= 65535 or str(int(port)) != port:
        raise ValueError("DEPLOY_PORT must be a canonical TCP port number")
    lookup = host if port == "22" else f"[{host}]:{port}"
    lines = list(dict.fromkeys(line.strip() for line in known_hosts.splitlines()
                               if line.strip() and not line.lstrip().startswith("#")))
    if not 1 <= len(lines) <= 16:
        raise ValueError("DEPLOY_KNOWN_HOSTS must contain between one and sixteen pinned keys")
    for line in lines:
        fields = line.split()
        if len(fields) < 3 or any(char in fields[0] for char in "*?!,@"):
            raise ValueError("DEPLOY_KNOWN_HOSTS must contain concrete host keys without wildcard or marker entries")

    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    with tempfile.TemporaryDirectory(prefix=".fantasy-ssh-", dir=directory) as temporary:
        staging = Path(temporary)
        candidate = staging / "known_hosts"
        candidate.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        candidate.chmod(0o600)
        fingerprints = keygen("-l", "-f", str(candidate)).splitlines()
        if len(fingerprints) != len(lines):
            raise ValueError("DEPLOY_KNOWN_HOSTS contains invalid host key records")
        matches = [line for line in keygen("-F", lookup, "-f", str(candidate)).splitlines()
                   if line and not line.startswith("#")]
        if matches != lines:
            raise ValueError("DEPLOY_KNOWN_HOSTS must pin only the configured host and port")

        known_path = directory / "deploy_known_hosts"
        config = ("Host *\n"
                  "  BatchMode yes\n"
                  "  StrictHostKeyChecking yes\n"
                  "  UpdateHostKeys no\n"
                  "  VerifyHostKeyDNS no\n"
                  "  GlobalKnownHostsFile none\n"
                  f'  UserKnownHostsFile "{known_path.as_posix()}"\n'
                  "  IdentitiesOnly yes\n"
                  "  PasswordAuthentication no\n"
                  "  KbdInteractiveAuthentication no\n")
        for name, content in [("deploy_key", private_key.rstrip() + "\n"),
                              ("deploy_known_hosts", candidate.read_text(encoding="utf-8")),
                              ("deploy_config", config)]:
            path = staging / name
            path.write_text(content, encoding="utf-8", newline="\n")
            path.chmod(0o600)
            path.replace(directory / name)
    return directory / "deploy_config"


if __name__ == "__main__":
    try:
        prepare_ssh(os.environ, Path.home() / ".ssh")
        print("Prepared operator-pinned SSH identity with strict host checking")
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Never echo key material, the trusted host or subprocess output.
        message = str(error) if isinstance(error, ValueError) else "Unable to prepare pinned SSH identity"
        print(f"[deploy:ssh] {message}", file=sys.stderr)
        sys.exit(1)
