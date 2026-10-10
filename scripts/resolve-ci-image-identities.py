#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#runtime
Bind classic config IDs and containerd manifest IDs to the same immutable archive.
"""
import hashlib
import json
import re
import subprocess
import sys
import tarfile


def archive_identities(path, commit, expected):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid source commit")
    metadata = {}
    with tarfile.open(path, "r|gz") as archive:
        for member in archive:
            if not member.isfile() or member.size > 256 * 1024:
                continue
            if member.name not in ("manifest.json", "index.json") and not re.fullmatch(r"blobs/sha256/[0-9a-f]{64}|[0-9a-f]{64}\.json", member.name):
                continue
            data = archive.extractfile(member).read()
            try:
                value = json.loads(data)
            except (ValueError, UnicodeDecodeError):
                continue
            metadata[member.name] = (value, hashlib.sha256(data).hexdigest())
            if len(metadata) > 256:
                raise ValueError("Unbounded image metadata")
    legacy = metadata.get("manifest.json", (None, None))[0]
    index = metadata.get("index.json", ({}, None))[0]
    if not isinstance(legacy, list) or len(legacy) != 2:
        raise ValueError("Exactly two exported CI images are required")
    result = []
    for target, digest in zip(("runtime", "setup"), expected):
        tag = f"fantasy-scout-ci:{commit}-{target}"
        matches = [entry for entry in legacy if entry.get("RepoTags") == [tag]]
        if len(matches) != 1:
            raise ValueError("Missing or ambiguous CI image tag")
        config_name = matches[0]["Config"]
        config, config_hash = metadata[config_name]
        config_digest = "sha256:" + config_hash
        if config.get("architecture") != "amd64" or config.get("os") != "linux" or config.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") != commit:
            raise ValueError("CI image configuration disagrees with source or platform")
        identities = {config_digest}
        for descriptor in index.get("manifests", []):
            annotations = descriptor.get("annotations", {})
            if annotations.get("io.containerd.image.name") not in (tag, "docker.io/library/" + tag):
                continue
            manifest_digest = descriptor["digest"]
            manifest, manifest_hash = metadata["blobs/sha256/" + manifest_digest.removeprefix("sha256:")]
            if manifest_digest != "sha256:" + manifest_hash or manifest.get("config", {}).get("digest") != config_digest:
                raise ValueError("OCI manifest/config digest binding is invalid")
            identities.add(manifest_digest)
        if digest not in identities:
            raise ValueError("Requested CI digest is absent from the immutable archive")
        result.append({"tag": tag, "configDigest": config_digest, "identities": identities})
    return result


def resolve_loaded(images, inspect):
    result = []
    for expected in images:
        actual = inspect(expected["tag"])
        if actual["Id"] not in expected["identities"]:
            raise ValueError("Loaded image identity differs from the verified CI archive")
        result.append(actual["Id"])
    return result


if __name__ == "__main__":
    try:
        images = archive_identities(sys.argv[1], sys.argv[2], sys.argv[3:5])
        if len(sys.argv) != 5:
            raise ValueError("Expected archive, commit and two exact CI digests")
        def inspect(tag):
            return json.loads(subprocess.check_output(["docker", "image", "inspect", tag]))[0]
        print("\n".join(resolve_loaded(images, inspect)))
    except (ValueError, KeyError, IndexError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
