#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#acceptance"""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("identities", Path(__file__).with_name("resolve-ci-image-identities.py"))
identities = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identities)


class ImageIdentityTests(unittest.TestCase):
    def fixture(self, root, wrong_binding=False):
        commit = "a" * 40
        blobs = {}
        legacy, descriptors, configs, manifests = [], [], [], []
        for target in ("runtime", "setup"):
            config = json.dumps({"architecture": "amd64", "os": "linux", "config": {"Labels": {"org.opencontainers.image.revision": commit}, "User": target}}).encode()
            config_hash = hashlib.sha256(config).hexdigest()
            blobs["blobs/sha256/" + config_hash] = config
            config_digest = "sha256:" + config_hash
            manifest = json.dumps({"schemaVersion": 2, "config": {"digest": "sha256:" + "0" * 64 if wrong_binding else config_digest}, "layers": []}).encode()
            manifest_hash = hashlib.sha256(manifest).hexdigest()
            blobs["blobs/sha256/" + manifest_hash] = manifest
            tag = f"fantasy-scout-ci:{commit}-{target}"
            legacy.append({"Config": "blobs/sha256/" + config_hash, "RepoTags": [tag], "Layers": []})
            descriptors.append({"digest": "sha256:" + manifest_hash, "annotations": {"io.containerd.image.name": "docker.io/library/" + tag}})
            configs.append(config_digest)
            manifests.append("sha256:" + manifest_hash)
        blobs["manifest.json"] = json.dumps(legacy).encode()
        blobs["index.json"] = json.dumps({"manifests": descriptors}).encode()
        path = root / "images.tar.gz"
        with tarfile.open(path, "w:gz") as archive:
            for name, data in blobs.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        return path, commit, configs, manifests

    def test_same_content_resolves_classic_and_containerd_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path, commit, configs, manifests = self.fixture(Path(directory))
            images = identities.archive_identities(path, commit, configs)
            self.assertEqual(identities.resolve_loaded(images, lambda tag: {"Id": configs[0] if tag.endswith("runtime") else configs[1]}), configs)
            self.assertEqual(identities.resolve_loaded(images, lambda tag: {"Id": manifests[0] if tag.endswith("runtime") else manifests[1]}), manifests)
            self.assertEqual(len(identities.archive_identities(path, commit, manifests)), 2)

    def test_wrong_source_requested_digest_or_loaded_content_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path, commit, configs, _ = self.fixture(Path(directory))
            with self.assertRaises(ValueError):
                identities.archive_identities(path, "b" * 40, configs)
            with self.assertRaises(ValueError):
                identities.archive_identities(path, commit, ["sha256:" + "0" * 64] * 2)
            with self.assertRaises(ValueError):
                identities.resolve_loaded(identities.archive_identities(path, commit, configs), lambda tag: {"Id": "sha256:" + "0" * 64})

    def test_oci_manifest_cannot_claim_another_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            path, commit, configs, _ = self.fixture(Path(directory), wrong_binding=True)
            with self.assertRaisesRegex(ValueError, "binding"):
                identities.archive_identities(path, commit, configs)


if __name__ == "__main__":
    unittest.main()
