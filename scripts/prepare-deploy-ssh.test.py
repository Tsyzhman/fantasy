#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#contracts"""
import getpass
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().with_name("prepare-deploy-ssh.py")
spec = importlib.util.spec_from_file_location("prepare_deploy_ssh", SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def command(*arguments):
    return subprocess.run(arguments, capture_output=True, text=True, timeout=10, check=True)


class PinnedSshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="fantasy-pinned-ssh-")
        cls.root = Path(cls.temporary.name).resolve()
        for name in ["server", "wrong-server", "client"]:
            command("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "isolated-fixture", "-f", str(cls.root / name))
        cls.public_key = (cls.root / "server.pub").read_text().strip()
        cls.wrong_key = (cls.root / "wrong-server.pub").read_text().strip()
        cls.private_key = (cls.root / "client").read_text()

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def environment(self, host="127.0.0.1", port="22", key=None):
        lookup = host if port == "22" else f"[{host}]:{port}"
        return {"DEPLOY_HOST": host, "DEPLOY_PORT": port,
                "DEPLOY_SSH_KEY": self.private_key,
                "DEPLOY_KNOWN_HOSTS": f"{lookup} {key or self.public_key}\n"}

    def test_valid_key_replaces_files_without_duplicates_and_keeps_strict_options(self):
        with tempfile.TemporaryDirectory(dir=self.root) as temporary:
            directory = Path(temporary) / "ssh config with spaces"
            env = self.environment()
            env["DEPLOY_KNOWN_HOSTS"] *= 2
            config = helper.prepare_ssh(env, directory)
            helper.prepare_ssh(env, directory)
            self.assertEqual((directory / "deploy_known_hosts").read_text(), self.environment()["DEPLOY_KNOWN_HOSTS"])
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ["deploy_config", "deploy_key", "deploy_known_hosts"])
            effective = command("ssh", "-G", "-F", str(config), "127.0.0.1").stdout
            for option in ["stricthostkeychecking true", "batchmode yes", "updatehostkeys false", "verifyhostkeydns false", "globalknownhostsfile none"]:
                self.assertIn(option, effective)
            if os.name != "nt":
                self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
                for path in directory.iterdir():
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_missing_or_invalid_trust_fails_before_installing_ssh_material(self):
        cases = [
            {"DEPLOY_KNOWN_HOSTS": ""},
            {"DEPLOY_KNOWN_HOSTS": "# comment only\n"},
            {"DEPLOY_KNOWN_HOSTS": "127.0.0.1 ssh-ed25519 not-base64\n"},
            {"DEPLOY_KNOWN_HOSTS": f"other.example {self.public_key}\n"},
            {"DEPLOY_KNOWN_HOSTS": f"[127.0.0.1]:2222 {self.public_key}\n"},
            {"DEPLOY_KNOWN_HOSTS": f"* {self.public_key}\n"},
            {"DEPLOY_KNOWN_HOSTS": f"@cert-authority 127.0.0.1 {self.public_key}\n"},
            {"DEPLOY_KNOWN_HOSTS": self.environment()["DEPLOY_KNOWN_HOSTS"] + "malformed\n"},
            {"DEPLOY_KNOWN_HOSTS": self.environment()["DEPLOY_KNOWN_HOSTS"] + "127.0.0.1 ssh-ed25519 not-base64\n"},
            {"DEPLOY_KNOWN_HOSTS": "sensitive-placeholder" * 1000},
            {"DEPLOY_HOST": "127.0.0.1\nProxyCommand touch unexpected"},
            {"DEPLOY_HOST": "-oProxyCommand=unexpected"},
            {"DEPLOY_PORT": "65536"}, {"DEPLOY_PORT": "0"},
            {"DEPLOY_PORT": "022"}, {"DEPLOY_PORT": "22\n"},
        ]
        for overrides in cases:
            with self.subTest(overrides=list(overrides)), tempfile.TemporaryDirectory(dir=self.root) as temporary:
                directory = Path(temporary) / "ssh"
                env = self.environment() | overrides
                with self.assertRaises(ValueError):
                    helper.prepare_ssh(env, directory)
                self.assertFalse((directory / "deploy_config").exists())
                self.assertFalse((directory / "deploy_key").exists())
                self.assertFalse((directory / "deploy_known_hosts").exists())
                if directory.exists():
                    self.assertEqual(list(directory.iterdir()), [])

    def test_nondefault_port_and_hashed_trusted_keys_are_supported(self):
        with tempfile.TemporaryDirectory(dir=self.root) as temporary:
            directory = Path(temporary)
            env = self.environment(port="2222")
            helper.prepare_ssh(env, directory)
            known_file = directory / "deploy_known_hosts"
            command("ssh-keygen", "-H", "-f", str(known_file))
            env["DEPLOY_KNOWN_HOSTS"] = known_file.read_text()
            helper.prepare_ssh(env, directory)
            self.assertTrue(known_file.read_text().startswith("|1|"))
            self.assertFalse(any(p.name.startswith(".fantasy-ssh-") for p in directory.iterdir()))

    def test_ipv6_hosts_keep_the_existing_ssh_endpoint_capability(self):
        for port in ["22", "2222"]:
            with self.subTest(port=port), tempfile.TemporaryDirectory(dir=self.root) as temporary:
                directory = Path(temporary)
                env = self.environment(host="::1", port=port)
                helper.prepare_ssh(env, directory)
                self.assertEqual((directory / "deploy_known_hosts").read_text(), env["DEPLOY_KNOWN_HOSTS"])

    def test_cli_reports_a_missing_secret_without_echoing_other_secrets(self):
        result = subprocess.run([os.sys.executable, "-B", str(SCRIPT)], env=os.environ | {
            "DEPLOY_HOST": "private-host.example", "DEPLOY_KNOWN_HOSTS": "",
            "DEPLOY_SSH_KEY": "private-key-sentinel"}, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertIn("DEPLOY_KNOWN_HOSTS secret is required", result.stderr)
        self.assertNotIn("private-key-sentinel", result.stderr)
        self.assertNotIn("private-host.example", result.stderr)

    def test_real_openssh_rejects_a_changed_host_key_without_learning_it(self):
        sshd = shutil.which("sshd") or ("/usr/sbin/sshd" if Path("/usr/sbin/sshd").exists() else None)
        self.assertIsNotNone(sshd, "Install openssh-server to run the required host key mismatch regression")
        with tempfile.TemporaryDirectory(dir=self.root) as temporary:
            directory = Path(temporary)
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                port = str(reservation.getsockname()[1])
            server_config = directory / "sshd_config"
            server_config.write_text(
                f"Port {port}\nListenAddress 127.0.0.1\n"
                f'HostKey "{(self.root / "server").as_posix()}"\n'
                f'PidFile "{(directory / "sshd.pid").as_posix()}"\n'
                "PasswordAuthentication no\nPubkeyAuthentication no\n"
                "KbdInteractiveAuthentication no\nPermitEmptyPasswords no\nLogLevel ERROR\n")
            log_path = directory / "sshd.log"
            with log_path.open("w+") as log:
                server = subprocess.Popen([sshd, "-D", "-e", "-f", str(server_config)], stdout=log, stderr=log)
                try:
                    ready = False
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        if server.poll() is not None:
                            log.flush()
                            self.fail(f"Isolated sshd failed: {log_path.read_text()}")
                        try:
                            with socket.create_connection(("127.0.0.1", int(port)), timeout=0.2):
                                ready = True
                                break
                        except OSError:
                            time.sleep(0.05)
                    self.assertTrue(ready, "Isolated SSH test server did not become ready")
                    client = directory / "client"
                    config = helper.prepare_ssh(self.environment(port=port), client)
                    arguments = ["ssh", "-F", str(config), "-i", str(client / "deploy_key"),
                                 "-p", port, "-o", "ConnectTimeout=3", "-o", "ConnectionAttempts=1",
                                 f"{getpass.getuser()}@127.0.0.1", "exit"]
                    # Authentication is deliberately disabled: a correct pin reaches that refusal.
                    correct = subprocess.run(arguments, capture_output=True, text=True, timeout=8)
                    self.assertNotEqual(correct.returncode, 0)
                    self.assertIn("Permission denied", correct.stderr)
                    self.assertNotIn("Host key verification failed", correct.stderr)
                    helper.prepare_ssh(self.environment(port=port, key=self.wrong_key), client)
                    known_path = client / "deploy_known_hosts"
                    before = known_path.read_bytes()
                    wrong = subprocess.run(arguments, capture_output=True, text=True, timeout=8)
                    self.assertNotEqual(wrong.returncode, 0)
                    self.assertIn("Host key verification failed", wrong.stderr)
                    self.assertNotIn("Permission denied", wrong.stderr)
                    self.assertEqual(known_path.read_bytes(), before)
                finally:
                    server.terminate()
                    try:
                        server.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
