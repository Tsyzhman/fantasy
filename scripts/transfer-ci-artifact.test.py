#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#contracts"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import warnings
from unittest.mock import patch
import urllib.error
import zipfile

SCRIPT = Path(__file__).with_name("transfer-ci-artifact.py").resolve()
spec = importlib.util.spec_from_file_location("ci_artifact", SCRIPT)
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
URL = "https://fixture.blob.core.windows.net/current.zip?sig=signed-url-sentinel"
TOKEN = "github-token-sentinel"


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Response(io.BytesIO):
    def __init__(self, data, status=206, headers=None):
        super().__init__(data)
        self.status, self.headers = status, headers or {}


class RangeStorage:
    def __init__(self, data, defect=None):
        self.data, self.defect, self.calls = data, defect, []

    def open(self, request, timeout):
        self.calls.append(request)
        start, stop = map(int, request.get_header("Range").removeprefix("bytes=").split("-"))
        payload = self.data[start:stop + 1]
        headers = {"Content-Range": f"bytes {start}-{stop}/{len(self.data)}", "Content-Length": str(len(payload))}
        status = 206
        if self.defect == "partial":
            payload = payload[:-1]
        elif self.defect == "overflow":
            payload += b"extra"
        elif self.defect == "range":
            headers["Content-Range"] = f"bytes {start}-{stop}/{len(self.data) + 1}"
        elif self.defect == "length":
            headers["Content-Length"] = str(len(payload) + 1)
        elif self.defect == "missing-length":
            del headers["Content-Length"]
        elif self.defect == "encoding":
            headers["Content-Encoding"] = "gzip"
        elif self.defect == "ignored-range":
            status = 200
        elif self.defect == "expired":
            raise urllib.error.HTTPError(URL, 403, "private URL must not be logged", {}, None)
        return Response(payload, status, headers)


class ArtifactTransportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="fantasy-ci-artifact-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.destination = self.root / "destination"
        self.destination.mkdir()
        self.control = {
            "release": "20261104T120000Z-v0.3.149-1234567", "commit": "1234567" + "a" * 33,
            "tree": "b" * 40, "version": "0.3.149", "workflow_sha": "c" * 40,
            "repository": "owner/repo", "repository_id": "77", "run_id": "123", "run_attempt": "2", "artifact_id": "456",
            "runtime_id": "sha256:" + "d" * 64, "setup_id": "sha256:" + "e" * 64,
            "url": URL, "budget_seconds": 3000,
        }
        self.names = transport.names_for(self.control["release"])
        source, sidecar, images, manifest = self.names
        self.contents = {source: b"immutable source archive", images: bytes(range(256)) * 512}
        self.contents[sidecar] = f"{sha(self.contents[source])}  {source}\n".encode()
        self.manifest = {"commit": self.control["commit"], "tree": self.control["tree"], "version": self.control["version"],
                         "runtimeImageId": self.control["runtime_id"], "setupImageId": self.control["setup_id"],
                         "archiveSha256": sha(self.contents[images]), "sourceArchiveSha256": sha(self.contents[source]),
                         "runId": "123", "runAttempt": "2", "repositoryId": "77"}
        self.contents[manifest] = json.dumps(self.manifest).encode()
        self.write_zip()

    def write_zip(self, entries=None, compression=zipfile.ZIP_STORED):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w", compression=compression) as bundle:
            for name, content in (entries if entries is not None else self.contents.items()):
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore", message="Duplicate name:.*", category=UserWarning)
                    bundle.writestr(name, content)
        self.data = data.getvalue()
        self.archive = self.root / "artifact.zip"
        self.archive.write_bytes(self.data)
        self.control.update(artifact_size=len(self.data), artifact_sha256=sha(self.data),
                            files={name: {"size": len(content), "sha256": sha(content)} for name, content in self.contents.items()})

    def receive(self, storage=None):
        storage = storage or RangeStorage(self.data)
        return transport.receive(self.control, self.destination,
                                 lambda control, path: transport.download(control, path, opener=storage))

    def assert_empty(self):
        self.assertEqual(list(self.destination.iterdir()), [])

    def provenance(self):
        c = self.control
        artifact = {"id": 456, "name": transport.artifact_name(c), "expired": False,
                    "digest": "sha256:" + c["artifact_sha256"], "size_in_bytes": len(self.data),
                    "workflow_run": {"id": 123, "repository_id": 77, "head_repository_id": 77, "head_sha": c["workflow_sha"]}}
        run = {"id": 123, "run_attempt": 2, "head_sha": c["workflow_sha"], "status": "in_progress", "event": "workflow_dispatch",
               "path": ".github/workflows/deploy-production.yml", "repository": {"id": 77}, "head_repository": {"id": 77}}
        return artifact, run

    def environment(self):
        for name, content in self.contents.items():
            (self.root / name).write_bytes(content)
        c = self.control
        return {"RELEASE": c["release"], "RELEASE_COMMIT": c["commit"], "RELEASE_TREE": c["tree"], "RELEASE_VERSION": c["version"],
                "GITHUB_SHA": c["workflow_sha"], "GITHUB_REPOSITORY": c["repository"], "GITHUB_REPOSITORY_ID": "77",
                "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "2", "ARTIFACT_ID": "456", "ARTIFACT_DIGEST": c["artifact_sha256"],
                "RUNTIME_IMAGE_ID": c["runtime_id"], "SETUP_IMAGE_ID": c["setup_id"], "GITHUB_TOKEN": TOKEN, "GH_TOKEN": TOKEN,
                "LOCAL_ARCHIVE": str(self.root / self.names[0]), "CHECKSUM_FILE": str(self.root / self.names[1]),
                "IMAGES_ARCHIVE": str(self.root / self.names[2]), "IMAGE_MANIFEST": str(self.root / self.names[3]),
                "RELEASE_CHECKSUM": c["files"][self.names[0]]["sha256"], "IMAGES_SHA256": c["files"][self.names[2]]["sha256"],
                "DEPLOY_HOST": "127.0.0.1", "DEPLOY_USER": "deploy", "DEPLOY_PORT": "22"}

    def test_ranges_cover_exact_bytes_and_publish_only_complete_archives(self):
        storage = RangeStorage(self.data)
        targets = self.receive(storage)
        self.assertEqual([path.name for path in targets], [self.names[0], self.names[2]])
        self.assertEqual(sorted(p.name for p in self.destination.iterdir()), sorted(p.name for p in targets))
        for target in targets:
            self.assertEqual(target.read_bytes(), self.contents[target.name])
        self.assertEqual(len(storage.calls), 8)
        ranges = sorted(tuple(map(int, req.get_header("Range").removeprefix("bytes=").split("-"))) for req in storage.calls)
        self.assertEqual(ranges[0][0], 0)
        self.assertEqual(ranges[-1][1], len(self.data) - 1)
        self.assertTrue(all(left[1] + 1 == right[0] for left, right in zip(ranges, ranges[1:])))
        self.assertTrue(all(req.get_header("Authorization") is None for req in storage.calls))

    def test_partial_overflow_wrong_range_length_encoding_and_ignored_ranges_fail_cleanly(self):
        for defect in ["partial", "overflow", "range", "length", "missing-length", "encoding", "ignored-range", "expired"]:
            with self.subTest(defect=defect), self.assertRaises(transport.TransferError):
                self.receive(RangeStorage(self.data, defect))
            self.assert_empty()

    def test_wrong_whole_zip_and_inner_file_hashes_fail_cleanly(self):
        self.control["artifact_sha256"] = "0" * 64
        with self.assertRaisesRegex(transport.TransferError, "download-hash"):
            self.receive()
        self.assert_empty()
        self.control["artifact_sha256"] = sha(self.data)
        self.control["files"][self.names[0]]["sha256"] = "0" * 64
        with self.assertRaisesRegex(transport.TransferError, "file-hash"):
            self.receive()
        self.assert_empty()

    def test_malformed_zip_with_valid_expected_transport_hash_is_rejected(self):
        self.data = self.data[:-20]
        self.control.update(artifact_size=len(self.data), artifact_sha256=sha(self.data))
        with self.assertRaises(zipfile.BadZipFile):
            self.receive()
        self.assert_empty()

    def test_traversal_absolute_duplicate_and_unexpected_entries_are_rejected(self):
        original = list(self.contents.items())
        for bad_name in ["../escape", "/absolute", "..\\escape", "nested/entry"]:
            self.write_zip(original + [(bad_name, b"bad")])
            with self.subTest(name=bad_name), self.assertRaisesRegex(transport.TransferError, "zip-entry"):
                self.receive()
            self.assert_empty()
        self.write_zip(original + [original[0]])
        with self.assertRaisesRegex(transport.TransferError, "zip-entry"):
            self.receive()
        self.assert_empty()
        self.assertFalse((self.root / "escape").exists())

    def test_symlink_and_directory_modes_are_rejected_without_extraction(self):
        for mode in [stat.S_IFLNK, stat.S_IFDIR]:
            entries = list(self.contents.items())
            info = zipfile.ZipInfo(self.names[0])
            info.create_system = 3
            info.external_attr = (mode | 0o777) << 16
            entries[0] = (info, entries[0][1])
            self.write_zip(entries)
            with self.subTest(mode=mode), self.assertRaisesRegex(transport.TransferError, "zip-entry"):
                self.receive()
            self.assert_empty()

    def test_compression_bomb_and_size_budget_are_rejected(self):
        self.contents[self.names[2]] = b"x" * 200000
        self.write_zip(compression=zipfile.ZIP_DEFLATED)
        with self.assertRaisesRegex(transport.TransferError, "zip-size"):
            self.receive()
        self.assert_empty()
        self.control["artifact_size"] = transport.MAX_ZIP + 1
        with self.assertRaisesRegex(transport.TransferError, "control"):
            self.receive()
        self.assert_empty()

    def test_manifest_source_version_tree_run_and_image_identity_cannot_be_substituted(self):
        original = copy.deepcopy(self.manifest)
        for field in ["commit", "tree", "version", "runtimeImageId", "setupImageId", "runId", "runAttempt", "repositoryId", "sourceArchiveSha256"]:
            altered = original | {field: "wrong"}
            self.contents[self.names[3]] = json.dumps(altered).encode()
            self.write_zip()
            with self.subTest(field=field), self.assertRaisesRegex(transport.TransferError, "manifest"):
                self.receive()
            self.assert_empty()

    def test_checksum_sidecar_is_checked_even_with_valid_outer_hash(self):
        self.contents[self.names[1]] = b"wrong sidecar"
        self.write_zip()
        with self.assertRaisesRegex(transport.TransferError, "manifest"):
            self.receive()
        self.assert_empty()

    def test_existing_targets_are_not_overwritten_and_partial_publication_is_rolled_back(self):
        existing = self.destination / self.names[0]
        existing.write_bytes(b"keep")
        with self.assertRaisesRegex(transport.TransferError, "destination"):
            self.receive()
        self.assertEqual(existing.read_bytes(), b"keep")
        existing.unlink()
        real_link = os.link
        calls = []
        def fail_second(source, target):
            calls.append(target)
            if len(calls) == 2:
                raise OSError("fixture publication failure")
            real_link(source, target)
        with patch.object(transport.os, "link", side_effect=fail_second), self.assertRaises(OSError):
            self.receive()
        self.assert_empty()

    def test_global_download_deadline_and_disk_budget_abort_before_publication(self):
        moments = iter([0, 999999] + [999999] * 100)
        with self.assertRaisesRegex(transport.TransferError, "timeout"):
            transport.receive(self.control, self.destination, lambda c, p: transport.download(c, p, RangeStorage(self.data), lambda: next(moments)))
        self.assert_empty()
        with patch.object(transport.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), self.assertRaisesRegex(transport.TransferError, "disk-space"):
            self.receive()
        self.assert_empty()

    def test_only_current_run_attempt_repository_digest_and_canonical_workflow_are_allowed(self):
        artifact, run = self.provenance()
        transport.validate_provenance(self.control, artifact, run)
        changes = [({"id": 999}, {}), ({"expired": True}, {}), ({"digest": "sha256:" + "0" * 64}, {}),
                   ({"name": "old-attempt"}, {}), ({"workflow_run": artifact["workflow_run"] | {"id": 122}}, {}),
                   ({"workflow_run": artifact["workflow_run"] | {"head_repository_id": 99}}, {}),
                   ({"workflow_run": artifact["workflow_run"] | {"head_sha": "a" * 40}}, {}),
                   ({}, {"run_attempt": 1}), ({}, {"status": "completed"}), ({}, {"path": ".github/workflows/foreign.yml"}),
                   ({}, {"repository": {"id": 99}}), ({}, {"head_repository": {"id": 99}})]
        for artifact_changes, run_changes in changes:
            with self.subTest(artifact=artifact_changes, run=run_changes), self.assertRaisesRegex(transport.TransferError, "provenance"):
                transport.validate_provenance(self.control, artifact | artifact_changes, run | run_changes)

    def test_signed_url_must_use_verified_storage_https_without_credentials_or_redirects(self):
        for url in ["http://fixture.blob.core.windows.net/a?sig=x", "https://user:password@fixture.blob.core.windows.net/a?sig=x",
                    "https://127.0.0.1/a?sig=x", "https://evil.example/a?sig=x", "https://fixture.blob.core.windows.net/a", URL + "#fragment"]:
            with self.subTest(url=url), self.assertRaises(transport.TransferError):
                transport.validate_url(url)
        self.assertIsNone(transport.NoRedirect().redirect_request(None, None, 302, "", {}, URL))
        calls = []
        class RedirectApi:
            def open(self, request, timeout):
                calls.append(request)
                raise urllib.error.HTTPError(request.full_url, 302, "", {"Location": URL}, None)
        self.assertEqual(transport.api_request("owner/repo", "actions/artifacts/456/zip", TOKEN, redirect=True, opener=RedirectApi()), URL)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].host, "api.github.com")
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer " + TOKEN)

    def test_url_only_travels_over_pinned_ssh_stdin_and_token_is_not_forwarded(self):
        environment = self.environment()
        observed = []
        def execute(argv, **kwargs):
            observed.append((argv, kwargs))
            self.assertNotIn(URL, " ".join(argv))
            self.assertNotIn(TOKEN, " ".join(argv))
            self.assertNotIn("GITHUB_TOKEN", kwargs["env"])
            self.assertNotIn("GH_TOKEN", kwargs["env"])
            self.assertNotIn(TOKEN.encode(), kwargs["input"])
            prefix, rest = kwargs["input"].split(b"\n", 1)
            control = json.loads(rest[int(prefix):])
            self.assertEqual(control["url"], URL)
            self.assertIn("deploy_config", argv[2])
            return SimpleNamespace(returncode=0, stdout=b"", stderr=b"")
        transport.send_over_ssh(self.control, environment, execute)
        self.assertEqual(len(observed), 1)

    def test_retry_mints_a_fresh_url_with_one_whole_transfer_budget_and_no_hash_retry(self):
        artifact, run = self.provenance()
        requests, urls = [], []
        def api(repo, path, token, redirect=False):
            self.assertEqual(token, TOKEN)
            requests.append(path)
            if redirect:
                return URL + f"&attempt={len(requests)}"
            return run if "actions/runs/" in path else artifact
        def sender(control, environment):
            urls.append(control["url"])
            self.assertLessEqual(control["budget_seconds"], transport.REMOTE_SECONDS)
            if len(urls) == 1:
                raise transport.TransferError("download")
        transport.client(self.environment(), api, sender)
        self.assertEqual(len(urls), 2)
        self.assertNotEqual(urls[0], urls[1])
        requests.clear()
        with self.assertRaisesRegex(transport.TransferError, "download-hash"):
            transport.client(self.environment(), api, lambda *_: (_ for _ in ()).throw(transport.TransferError("download-hash")))
        self.assertEqual(sum(path.endswith("/zip") for path in requests), 1)

    def test_bootstrap_receiver_redacts_urls_and_tokens_on_failure(self):
        code = SCRIPT.read_bytes()
        invalid = self.control | {"commit": "invalid", "private_sentinel": TOKEN}
        bootstrap = 'import sys; exec(compile(sys.stdin.buffer.read(int(sys.stdin.buffer.readline(16))), "<ci-artifact-receiver>", "exec"))'
        result = subprocess.run([sys.executable, "-B", "-c", bootstrap, "--receive"],
                                input=str(len(code)).encode() + b"\n" + code + json.dumps(invalid).encode(), capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"CI_ARTIFACT_ERROR identity", result.stderr)
        self.assertNotIn(URL.encode(), result.stdout + result.stderr)
        self.assertNotIn(TOKEN.encode(), result.stdout + result.stderr)
        self.assertNotIn(b"Traceback", result.stderr)

    def test_prestage_accepts_only_exact_current_file_and_consumes_it_privately(self):
        inbox = self.root / "private-inbox"
        inbox.mkdir(mode=0o700)
        control = self.control | {"transport": "operator-prestage"}
        del control["url"]
        incoming = transport.incoming_path(control, inbox)
        incoming.write_bytes(self.data)
        incoming.chmod(0o600)
        targets = transport.receive(control, self.destination, inbox=inbox)
        self.assertEqual(len(targets), 2)
        self.assertFalse(incoming.exists())
        self.assertEqual(list(inbox.iterdir()), [])
        self.assertFalse(any(p.is_dir() for p in self.destination.iterdir()))

    def test_prestage_ignores_partial_and_foreign_run_names_until_bounded_deadline(self):
        inbox = self.root / "private-inbox"
        inbox.mkdir(mode=0o700)
        incoming = transport.incoming_path(self.control, inbox)
        Path(str(incoming) + ".partial").write_bytes(self.data)
        transport.incoming_path(self.control | {"run_id": "122"}, inbox).write_bytes(self.data)
        moments = iter([0, 0, 999999])
        with self.assertRaisesRegex(transport.TransferError, "timeout"):
            transport.receive_prestaged(self.control, self.root / "received.zip", inbox, lambda: next(moments), lambda _: None)
        self.assertFalse((self.root / "received.zip").exists())
        self.assertEqual(len(list(inbox.iterdir())), 2)

    def test_prestage_wrong_length_and_digest_never_publish_archives(self):
        inbox = self.root / "private-inbox"
        inbox.mkdir(mode=0o700)
        control = self.control | {"transport": "operator-prestage"}
        del control["url"]
        incoming = transport.incoming_path(control, inbox)
        incoming.write_bytes(b"partial")
        incoming.chmod(0o600)
        with self.assertRaisesRegex(transport.TransferError, "destination"):
            transport.receive(control, self.destination, inbox=inbox)
        self.assert_empty()
        self.assertFalse(incoming.exists())
        incoming.write_bytes(self.data[:-1] + bytes([self.data[-1] ^ 1]))
        with self.assertRaisesRegex(transport.TransferError, "download-hash"):
            transport.receive(control, self.destination, inbox=inbox)
        self.assert_empty()
        self.assertFalse(incoming.exists())

    def test_prestage_directory_or_symlink_metadata_is_rejected_without_reading(self):
        inbox = self.root / "private-inbox"
        inbox.mkdir(mode=0o700)
        incoming = transport.incoming_path(self.control, inbox)
        incoming.mkdir()
        with self.assertRaisesRegex(transport.TransferError, "destination"):
            transport.receive_prestaged(self.control, self.root / "received.zip", inbox)
        self.assertFalse((self.root / "received.zip").exists())
        incoming.rmdir()
        incoming.write_bytes(self.data)
        incoming.chmod(0o600)
        real_lstat = Path.lstat
        def symlink_metadata(path):
            actual = real_lstat(path)
            if path == incoming:
                return SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_size=actual.st_size)
            return actual
        with patch.object(Path, "lstat", symlink_metadata), self.assertRaisesRegex(transport.TransferError, "destination"):
            transport.receive_prestaged(self.control, self.root / "received.zip", inbox)
        self.assertEqual(incoming.read_bytes(), self.data)

    def test_prestage_client_does_not_mint_or_forward_signed_url(self):
        artifact, run = self.provenance()
        calls, controls = [], []
        def api(repo, path, token, redirect=False):
            self.assertFalse(redirect)
            calls.append(path)
            return run if "actions/runs/" in path else artifact
        with patch("sys.stdout", new_callable=io.StringIO) as output:
            transport.client(self.environment() | {"ARTIFACT_TRANSPORT": "operator-prestage"}, api, lambda c, _: controls.append(copy.deepcopy(c)))
            diagnostic = output.getvalue()
        self.assertEqual(len(calls), 2)
        self.assertNotIn("url", controls[0])
        self.assertEqual(controls[0]["budget_seconds"], transport.PRESTAGE_SECONDS + 120)
        self.assertIn("WAITING_CI_ARTIFACT", diagnostic)
        self.assertIn(self.control["artifact_sha256"], diagnostic)
        self.assertIn(str(transport.incoming_path(self.control)), diagnostic)
        self.assertNotIn(TOKEN, diagnostic)
        self.assertNotIn(URL, diagnostic)

    def test_operator_download_is_atomic_exact_current_run_and_transport_only(self):
        artifact, run = self.provenance()
        def api(repo, path, token, redirect=False):
            if redirect:
                return URL
            return run if "actions/runs/" in path else artifact
        output = self.root / "operator.zip"
        with patch("sys.stdout", new_callable=io.StringIO):
            transport.operator_download(self.environment(), output, api,
                lambda c, p: transport.download(c, p, RangeStorage(self.data)))
        self.assertEqual(output.read_bytes(), self.data)
        self.assertFalse(any(p.name.startswith(".fantasy-ci-local-") for p in self.root.iterdir()))
        output.unlink()
        with self.assertRaisesRegex(transport.TransferError, "download-size"):
            transport.operator_download(self.environment(), output, api,
                lambda c, p: transport.download(c, p, RangeStorage(self.data, "partial")))
        self.assertFalse(output.exists())
        self.assertFalse(any(p.name.startswith(".fantasy-ci-local-") for p in self.root.iterdir()))
        with self.assertRaisesRegex(transport.TransferError, "provenance"):
            transport.operator_download(self.environment() | {"GITHUB_RUN_ATTEMPT": "1"}, output, api)
        self.assertFalse(output.exists())

    def test_workflow_binds_transport_to_mandatory_current_upload_and_preserves_promoter(self):
        workflow = (SCRIPT.parent.parent / ".github/workflows/deploy-production.yml").read_text()
        self.assertIn("      actions: read", workflow)
        self.assertIn("        default: https", workflow)
        self.assertIn("          - operator-prestage", workflow)
        self.assertIn("ARTIFACT_TRANSPORT: ${{ inputs.artifact_transport }}", workflow)
        upload = workflow.split("      - name: Retain immutable release archive and image manifest", 1)[1].split("      - name:", 1)[0]
        self.assertIn("        id: artifact", upload)
        self.assertNotIn("continue-on-error", upload)
        self.assertIn("-run${{ github.run_id }}-attempt${{ github.run_attempt }}", upload)
        self.assertIn("ARTIFACT_ID: ${{ steps.artifact.outputs.artifact-id }}", workflow)
        self.assertIn("ARTIFACT_DIGEST: ${{ steps.artifact.outputs.artifact-digest }}", workflow)
        self.assertIn("run: python3 -B scripts/transfer-ci-artifact.py", workflow)
        self.assertIn("< scripts/deploy-production-docker.sh", workflow)
        self.assertNotIn('"$IMAGES_ARCHIVE" \\n', workflow)
        self.assertIn("    needs: [resolve-source, validate-source]", workflow)
        self.assertIn("git merge-base --is-ancestor origin/main HEAD", workflow)
        self.assertIn('git merge-base --is-ancestor "$current_commit" "$CANDIDATE_COMMIT"', workflow)
        checks = (SCRIPT.parent.parent / ".github/workflows/check.yml").read_text()
        self.assertIn("python3 -B scripts/transfer-ci-artifact.test.py", checks)


if __name__ == "__main__":
    unittest.main(verbosity=2)
