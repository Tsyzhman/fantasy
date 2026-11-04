#!/usr/bin/env python3
"""Current-run immutable artifact transport. Credentials/URLs never enter argv/files/logs.

@spec spec://common/INFRA-006-continuous-deployment#contracts
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

MIB = 1024 * 1024
MAX_ZIP = 2048 * MIB
MAX_SOURCE = 512 * MIB
MAX_IMAGES = 2048 * MIB
MAX_CONTROL = 32768
DOWNLOAD_SECONDS = 2700
REMOTE_SECONDS = 3000
DOWNLOAD_WORKERS = 8
PRESTAGE_SECONDS = 1200
INBOX = Path("/tmp/fantasy-scout-ci-artifacts")
ERROR_CODES = {"control", "identity", "provenance", "api", "url", "download", "download-size",
               "download-hash", "timeout", "zip-entry", "zip-size", "file-hash", "manifest",
               "disk-space", "destination", "ssh", "interrupted", "operation-failed"}


class TransferError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def check(condition, code):
    if not condition:
        raise TransferError(code)


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(MIB):
            digest.update(chunk)
    return digest.hexdigest()


def validate_url(url):
    check(isinstance(url, str) and len(url) <= 8192 and not any(c.isspace() for c in url), "url")
    try:
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise TransferError("url") from error
    check(parsed.scheme == "https" and not parsed.username and not parsed.password
          and port in (None, 443) and not parsed.fragment, "url")
    check(parsed.hostname and any(parsed.hostname.endswith(suffix) for suffix in
          (".blob.core.windows.net", ".actions.githubusercontent.com", ".githubusercontent.com")), "url")
    check(bool(parsed.query), "url")
    return url


def names_for(release):
    source = f"fantasy-scout-release-{release}.tar.gz"
    images = f"fantasy-scout-images-{release}.tar.gz"
    return source, source + ".sha256", images, f"fantasy-scout-images-{release}.json"


def validate_control(control):
    check(isinstance(control, dict), "control")
    for key, pattern in {
        "release": r"[0-9]{8}T[0-9]{6}Z-v[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{7,40}",
        "commit": r"[0-9a-f]{40}", "tree": r"[0-9a-f]{40}", "workflow_sha": r"[0-9a-f]{40}",
        "version": r"[0-9]+\.[0-9]+\.[0-9]+", "repository": r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
        "run_id": r"[1-9][0-9]*", "run_attempt": r"[1-9][0-9]*", "repository_id": r"[1-9][0-9]*",
        "artifact_id": r"[1-9][0-9]*", "artifact_sha256": r"[0-9a-f]{64}",
        "runtime_id": r"sha256:[0-9a-f]{64}", "setup_id": r"sha256:[0-9a-f]{64}",
    }.items():
        check(isinstance(control.get(key), str) and re.fullmatch(pattern, control[key]), "identity")
    check(control["release"].endswith("-" + control["commit"][:7])
          and f"-v{control['version']}-" in control["release"], "identity")
    check(type(control.get("artifact_size")) is int and 0 < control["artifact_size"] <= MAX_ZIP, "control")
    files = control.get("files")
    names = names_for(control["release"])
    check(isinstance(files, dict) and set(files) == set(names), "control")
    for name, maximum in zip(names, [MAX_SOURCE, 256, MAX_IMAGES, 16384]):
        item = files[name]
        check(isinstance(item, dict) and type(item.get("size")) is int
              and 0 < item["size"] <= maximum and re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", ""))), "control")
    check(control.get("transport", "https") in ("https", "operator-prestage"), "control")
    if "url" in control:
        check(control.get("transport", "https") == "https", "control")
        validate_url(control["url"])
    if "budget_seconds" in control:
        check(type(control["budget_seconds"]) is int and 60 <= control["budget_seconds"] <= REMOTE_SECONDS, "control")
    return names


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api_request(repository, path, token, redirect=False, opener=None):
    # Authorization can only reach this fixed GitHub API origin; never follow a redirect.
    opener = opener or urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(f"https://api.github.com/repos/{repository}/{path}", headers={
        "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "fantasy-scout-ci-artifact"})
    try:
        with opener.open(request, timeout=30) as response:
            check(not redirect and response.status == 200, "api")
            data = response.read(MAX_CONTROL + 1)
            check(len(data) <= MAX_CONTROL, "api")
            return json.loads(data)
    except urllib.error.HTTPError as error:
        try:
            check(redirect and error.code == 302, "api")
            return validate_url(error.headers.get("Location", ""))
        finally:
            error.close()


def validate_provenance(control, artifact, run):
    workflow_run = artifact.get("workflow_run") or {}
    check(artifact.get("id") == int(control["artifact_id"])
          and artifact.get("name") == artifact_name(control)
          and artifact.get("expired") is False
          and artifact.get("digest") == "sha256:" + control["artifact_sha256"]
          and artifact.get("size_in_bytes") == control["artifact_size"], "provenance")
    check(workflow_run.get("id") == int(control["run_id"])
          and workflow_run.get("repository_id") == int(control["repository_id"])
          and workflow_run.get("head_repository_id") == int(control["repository_id"])
          and workflow_run.get("head_sha") == control["workflow_sha"], "provenance")
    check(run.get("id") == int(control["run_id"]) and run.get("run_attempt") == int(control["run_attempt"])
          and run.get("head_sha") == control["workflow_sha"] and run.get("status") == "in_progress"
          and run.get("event") == "workflow_dispatch"
          and (run.get("path") or "").split("@", 1)[0] == ".github/workflows/deploy-production.yml"
          and (run.get("repository") or {}).get("id") == int(control["repository_id"])
          and (run.get("head_repository") or {}).get("id") == int(control["repository_id"]), "provenance")


def artifact_name(control):
    return f"production-release-{control['release']}-run{control['run_id']}-attempt{control['run_attempt']}"


def download(control, target, opener=None, clock=time.monotonic, workers=DOWNLOAD_WORKERS):
    validate_url(control["url"])
    size = control["artifact_size"]
    check(type(size) is int and 0 < size <= MAX_ZIP, "download-size")
    deadline = clock() + min(DOWNLOAD_SECONDS, control.get("budget_seconds", REMOTE_SECONDS) - 60)
    cancelled = threading.Event()
    count = min(workers, size)
    check(1 <= count <= DOWNLOAD_WORKERS, "control")
    # One pre-sized file and disjoint writes avoid a second ZIP-sized merge/copy.
    with target.open("xb") as output:
        output.truncate(size)

    def part(index):
        start, stop = size * index // count, size * (index + 1) // count
        expected = stop - start
        request = urllib.request.Request(control["url"], headers={
            "Range": f"bytes={start}-{stop - 1}", "Accept-Encoding": "identity", "User-Agent": "fantasy-scout-ci-artifact"})
        connection = opener or urllib.request.build_opener(NoRedirect())
        check(not cancelled.is_set() and clock() < deadline, "timeout")
        try:
            with connection.open(request, timeout=30) as response, target.open("r+b") as output:
                check(response.status == 206 and response.headers.get("Content-Range") == f"bytes {start}-{stop - 1}/{size}", "download-size")
                check(response.headers.get("Content-Length") == str(expected)
                      and response.headers.get("Content-Encoding", "identity") == "identity", "download-size")
                output.seek(start)
                received = 0
                while True:
                    check(not cancelled.is_set() and clock() < deadline, "timeout")
                    chunk = response.read1(min(MIB, expected - received + 1))
                    if not chunk:
                        break
                    received += len(chunk)
                    check(received <= expected, "download-size")
                    output.write(chunk)
                check(received == expected, "download-size")
                output.flush()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if isinstance(error, urllib.error.HTTPError):
                error.close()
            raise TransferError("download") from error

    previous_stack = threading.stack_size(512 * 1024)
    try:
        with ThreadPoolExecutor(max_workers=count) as pool:
            futures = [pool.submit(part, index) for index in range(count)]
            try:
                for future in as_completed(futures):
                    future.result()
            except BaseException:
                cancelled.set()
                for future in futures:
                    future.cancel()
                raise
    finally:
        threading.stack_size(previous_stack)
    with target.open("r+b") as output:
        os.fsync(output.fileno())
    check(clock() < deadline, "timeout")
    check(digest_file(target) == control["artifact_sha256"], "download-hash")


def unpack_verified(control, archive, staging):
    names = validate_control(control)
    check(archive.stat().st_size == control["artifact_size"] and digest_file(archive) == control["artifact_sha256"], "download-hash")
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        check(len(entries) == 4 and {entry.filename for entry in entries} == set(names), "zip-entry")
        for entry in entries:
            mode = stat.S_IFMT(entry.external_attr >> 16)
            check(entry.orig_filename == entry.filename and not entry.is_dir()
                  and mode in (0, stat.S_IFREG) and not entry.external_attr & 0x10
                  and not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "zip-entry")
            expected = control["files"][entry.filename]
            check(entry.file_size == expected["size"] and entry.file_size <= max(1, entry.compress_size) * 100, "zip-size")
        check(sum(e.file_size for e in entries) <= MAX_SOURCE + MAX_IMAGES + 16640, "zip-size")
        for entry in entries:
            expected = control["files"][entry.filename]
            digest, size = hashlib.sha256(), 0
            with bundle.open(entry) as source, (staging / entry.filename).open("xb") as output:
                while chunk := source.read(MIB):
                    size += len(chunk)
                    check(size <= expected["size"], "zip-size")
                    output.write(chunk)
                    digest.update(chunk)
                output.flush()
                os.fsync(output.fileno())
            check(size == expected["size"] and digest.hexdigest() == expected["sha256"], "file-hash")
    source, sidecar, images, manifest = names
    expected_sidecar = f"{control['files'][source]['sha256']}  {source}\n"
    check((staging / sidecar).read_text("utf-8") == expected_sidecar, "manifest")
    expected_manifest = {"commit": control["commit"], "tree": control["tree"], "version": control["version"],
                         "runtimeImageId": control["runtime_id"], "setupImageId": control["setup_id"],
                         "archiveSha256": control["files"][images]["sha256"],
                         "sourceArchiveSha256": control["files"][source]["sha256"],
                         "runId": control["run_id"], "runAttempt": control["run_attempt"], "repositoryId": control["repository_id"]}
    check(json.loads((staging / manifest).read_text("utf-8")) == expected_manifest, "manifest")
    return source, images


def publish(control, archive, destination):
    names = validate_control(control)
    destination = Path(destination).resolve(strict=True)
    targets = [destination / name for name in (names[0], names[2])]
    check(all(not path.exists() and not path.is_symlink() for path in targets), "destination")
    # Staging is on the same filesystem. Each no-clobber link publishes a complete file atomically.
    with tempfile.TemporaryDirectory(prefix=".fantasy-ci-artifact-", dir=destination) as directory:
        staging = Path(directory)
        published = []
        try:
            source_names = unpack_verified(control, archive, staging)
            for name, target in zip(source_names, targets):
                source = staging / name
                identity = source.stat()
                published.append((target, identity))
                os.link(source, target)
        except BaseException:
            for target, identity in published:
                try:
                    current = target.lstat()
                except FileNotFoundError:
                    continue
                if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino):
                    target.unlink()
            raise
    return targets


def incoming_path(control, inbox=INBOX):
    for field in ("run_id", "run_attempt", "artifact_id"):
        check(re.fullmatch(r"[1-9][0-9]*", str(control.get(field, ""))), "identity")
    check(re.fullmatch(r"[0-9a-f]{64}", str(control.get("artifact_sha256", ""))), "identity")
    return inbox / f"run-{control['run_id']}-attempt-{control['run_attempt']}-artifact-{control['artifact_id']}-sha256-{control['artifact_sha256']}.zip"


def receive_prestaged(control, target, inbox=INBOX, clock=time.monotonic, sleep=time.sleep):
    path = incoming_path(control, inbox)
    inbox.mkdir(mode=0o700, exist_ok=True)
    directory = inbox.lstat()
    check(stat.S_ISDIR(directory.st_mode), "destination")
    if os.name == "posix":
        check(directory.st_uid == os.geteuid() and directory.st_mode & 0o077 == 0, "destination")
    deadline = clock() + min(PRESTAGE_SECONDS, control.get("budget_seconds", REMOTE_SECONDS) - 60)
    while True:
        check(clock() < deadline, "timeout")
        try:
            identity = path.lstat()
        except FileNotFoundError:
            sleep(1)
            continue
        check(stat.S_ISREG(identity.st_mode), "destination")
        if os.name == "posix":
            check(identity.st_uid == os.geteuid() and identity.st_mode & 0o077 == 0, "destination")
        # The operator publishes .partial -> this exact name atomically, never a different run.
        os.link(path, target, follow_symlinks=False)
        current = target.lstat()
        check(stat.S_ISREG(current.st_mode) and (identity.st_dev, identity.st_ino) == (current.st_dev, current.st_ino), "destination")
        remaining = path.lstat()
        if (identity.st_dev, identity.st_ino) == (remaining.st_dev, remaining.st_ino):
            path.unlink()
        check(current.st_size == control["artifact_size"], "destination")
        return


def receive(control, destination=Path("/tmp"), downloader=download, inbox=INBOX):
    validate_control(control)
    mode = control.get("transport", "https")
    check(mode == "operator-prestage" or "url" in control, "control")
    required = control["artifact_size"] + sum(item["size"] for item in control["files"].values()) + 128 * MIB
    check(shutil.disk_usage(destination).free >= required, "disk-space")
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix=".fantasy-ci-download-", dir=destination) as directory:
        archive = Path(directory) / "artifact.zip"
        if mode == "https":
            downloader(control, archive)
        else:
            receive_prestaged(control, archive, inbox)
        return publish(control, archive, destination)


def control_from_environment(environ):
    mapping = {"release": "RELEASE", "commit": "RELEASE_COMMIT", "tree": "RELEASE_TREE", "version": "RELEASE_VERSION",
               "workflow_sha": "GITHUB_SHA", "repository": "GITHUB_REPOSITORY", "repository_id": "GITHUB_REPOSITORY_ID",
               "run_id": "GITHUB_RUN_ID", "run_attempt": "GITHUB_RUN_ATTEMPT", "artifact_id": "ARTIFACT_ID",
               "artifact_sha256": "ARTIFACT_DIGEST", "runtime_id": "RUNTIME_IMAGE_ID", "setup_id": "SETUP_IMAGE_ID"}
    control = {key: environ.get(variable, "") for key, variable in mapping.items()}
    names = names_for(control["release"])
    paths = [Path(environ.get(variable, "")) for variable in ("LOCAL_ARCHIVE", "CHECKSUM_FILE", "IMAGES_ARCHIVE", "IMAGE_MANIFEST")]
    control["files"] = {name: {"size": path.stat().st_size, "sha256": digest_file(path)} for name, path in zip(names, paths)}
    control["transport"] = environ.get("ARTIFACT_TRANSPORT", "https")
    control["artifact_size"] = 1  # Filled from authenticated metadata before validation/transfer.
    validate_control(control)
    check(control["files"][names[0]]["sha256"] == environ.get("RELEASE_CHECKSUM")
          and control["files"][names[2]]["sha256"] == environ.get("IMAGES_SHA256"), "file-hash")
    return control


def send_over_ssh(control, environ, execute=subprocess.run):
    host, user, port = environ.get("DEPLOY_HOST", ""), environ.get("DEPLOY_USER", ""), environ.get("DEPLOY_PORT") or "22"
    check(re.fullmatch(r"[A-Za-z0-9:.%-]+", host) and re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", user)
          and re.fullmatch(r"[1-9][0-9]{0,4}", port) and int(port) <= 65535, "ssh")
    bootstrap = 'import sys; exec(compile(sys.stdin.buffer.read(int(sys.stdin.buffer.readline(16))), "<ci-artifact-receiver>", "exec"))'
    budget = control.get("budget_seconds", REMOTE_SECONDS)
    check(type(budget) is int and 60 <= budget <= REMOTE_SECONDS, "control")
    command = f"ulimit -c 0; ulimit -v 262144; timeout --signal=TERM --kill-after=15s {budget}s python3 -B -c '{bootstrap}' --receive"
    argv = ["ssh", "-F", str(Path.home() / ".ssh/deploy_config"), "-i", str(Path.home() / ".ssh/deploy_key"),
            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4", "-o", "ConnectTimeout=20", "-p", port, f"{user}@{host}", command]
    code = Path(__file__).read_bytes()
    payload = json.dumps(control, separators=(",", ":")).encode()
    check(len(code) <= 65536 and len(payload) <= MAX_CONTROL, "control")
    child_environment = {key: value for key, value in environ.items() if key not in ("GITHUB_TOKEN", "GH_TOKEN")}
    result = execute(argv, input=str(len(code)).encode() + b"\n" + code + payload,
                     capture_output=True, timeout=budget + 15, env=child_environment)
    if result.returncode:
        codes = [line.removeprefix("CI_ARTIFACT_ERROR ") for line in result.stderr.decode("utf-8", errors="replace").splitlines()
                 if line.startswith("CI_ARTIFACT_ERROR ")]
        raise TransferError(codes[-1] if codes and codes[-1] in ERROR_CODES else "ssh")
    # Never relay untrusted SSH/network output: only locally known identities are logged.


def client(environ, api=api_request, sender=send_over_ssh):
    control = control_from_environment(environ)
    token = environ.get("GITHUB_TOKEN", "")
    check(bool(token), "api")
    repo = control["repository"]
    artifact = api(repo, f"actions/artifacts/{control['artifact_id']}", token)
    control["artifact_size"] = artifact.get("size_in_bytes")
    validate_control(control)
    run = api(repo, f"actions/runs/{control['run_id']}", token)
    validate_provenance(control, artifact, run)
    # All range connections start together on a fresh URL. A failed download may restart once
    # with a fresh URL, never an expired URL or previous run, within one overall wall budget.
    started = time.monotonic()
    deadline = started + REMOTE_SECONDS
    if control["transport"] == "operator-prestage":
        control["budget_seconds"] = PRESTAGE_SECONDS + 120
        print(f"WAITING_CI_ARTIFACT repository={control['repository']} repository_id={control['repository_id']} workflow_sha={control['workflow_sha']} release={control['release']} run={control['run_id']} attempt={control['run_attempt']} artifact={control['artifact_id']} commit={control['commit']} zip_sha256={control['artifact_sha256']} path={incoming_path(control)}", flush=True)
        sender(control, environ)
        elapsed = round(time.monotonic() - started, 2)
        print(f"VERIFIED_CI_ARTIFACT transport=operator-prestage run={control['run_id']} attempt={control['run_attempt']} artifact={control['artifact_id']} commit={control['commit']} bytes={control['artifact_size']} seconds={elapsed}", flush=True)
        return
    for attempt in range(2):
        control["budget_seconds"] = int(deadline - time.monotonic())
        check(control["budget_seconds"] >= 60, "timeout")
        control["url"] = api(repo, f"actions/artifacts/{control['artifact_id']}/zip", token, redirect=True)
        validate_url(control["url"])
        try:
            sender(control, environ)
            break
        except TransferError as error:
            if attempt or error.code not in {"download", "download-size", "timeout"}:
                raise
    elapsed = round(time.monotonic() - started, 2)
    print(f"VERIFIED_CI_ARTIFACT run={control['run_id']} attempt={control['run_attempt']} artifact={control['artifact_id']} commit={control['commit']} bytes={control['artifact_size']} seconds={elapsed}")


def operator_download(environ, output, api=api_request, downloader=download):
    # Transport only: current-run identity is required, and no remote/promoter action exists here.
    fields = {"repository": "GITHUB_REPOSITORY", "repository_id": "GITHUB_REPOSITORY_ID", "workflow_sha": "GITHUB_SHA",
              "run_id": "GITHUB_RUN_ID", "run_attempt": "GITHUB_RUN_ATTEMPT", "artifact_id": "ARTIFACT_ID",
              "artifact_sha256": "ARTIFACT_DIGEST", "release": "RELEASE"}
    control = {key: environ.get(value, "") for key, value in fields.items()}
    check(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", control["repository"])
          and re.fullmatch(r"[0-9a-f]{40}", control["workflow_sha"])
          and re.fullmatch(r"[1-9][0-9]*", control["repository_id"]), "identity")
    incoming_path(control)  # Validate all numeric IDs and the independent workflow digest.
    token = environ.get("GITHUB_TOKEN", "")
    check(bool(token), "api")
    repo = control["repository"]
    artifact = api(repo, f"actions/artifacts/{control['artifact_id']}", token)
    control["artifact_size"] = artifact.get("size_in_bytes")
    check(type(control["artifact_size"]) is int and 0 < control["artifact_size"] <= MAX_ZIP, "control")
    run = api(repo, f"actions/runs/{control['run_id']}", token)
    validate_provenance(control, artifact, run)
    control["url"] = api(repo, f"actions/artifacts/{control['artifact_id']}/zip", token, redirect=True)
    validate_url(control["url"])
    control["budget_seconds"] = PRESTAGE_SECONDS
    output = Path(output).absolute()
    check(not output.exists() and not output.is_symlink(), "destination")
    check(shutil.disk_usage(output.parent).free >= control["artifact_size"] + 128 * MIB, "disk-space")
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix=".fantasy-ci-local-", dir=output.parent) as temporary:
        archive = Path(temporary) / "artifact.zip"
        downloader(control, archive)
        check(archive.stat().st_size == control["artifact_size"] and digest_file(archive) == control["artifact_sha256"], "download-hash")
        os.link(archive, output)
    print(f"VERIFIED_LOCAL_CI_ZIP run={control['run_id']} attempt={control['run_attempt']} artifact={control['artifact_id']} sha256={control['artifact_sha256']} path={output}", flush=True)


def safe_code(error):
    return error.code if isinstance(error, TransferError) and error.code in ERROR_CODES else "operation-failed"


def interrupted(_signum, _frame):
    raise TransferError("interrupted")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--receive"]:
            for name in ("SIGTERM", "SIGINT", "SIGHUP"):
                if hasattr(signal, name):
                    signal.signal(getattr(signal, name), interrupted)
            data = sys.stdin.buffer.read(MAX_CONTROL + 1)
            check(len(data) <= MAX_CONTROL, "control")
            receive(json.loads(data))
        elif len(sys.argv) == 3 and sys.argv[1] == "--download-zip":
            operator_download(os.environ, sys.argv[2])
        else:
            check(not sys.argv[1:], "control")
            client(os.environ)
    except BaseException as error:
        print(f"CI_ARTIFACT_ERROR {safe_code(error)}", file=sys.stderr)
        sys.exit(1)
