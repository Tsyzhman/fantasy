"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#data"""
import pathlib
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock


@unittest.skipUnless(sys.platform == "linux", "Linux production flock")
class InterruptedCollection(unittest.TestCase):
    def test_child_holds_lock_until_exit_then_retry_succeeds(self):
        import importlib.util
        module = pathlib.Path(__file__).with_name("sync.py")
        spec = importlib.util.spec_from_file_location("collector_under_test", module)
        collector = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"research": Mock()}):
            spec.loader.exec_module(collector)
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            with collector.collection_lock(root) as fds:
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], pass_fds=fds)
            try:
                with self.assertRaisesRegex(SystemExit, "active"), collector.collection_lock(root):
                    pass
            finally:
                child.send_signal(signal.SIGKILL)
                child.wait(timeout=5)
            with collector.collection_lock(root):
                self.assertTrue((root / ".collection.flock").exists())
            (root / ".collection.lock").write_text("9")
            with self.assertRaisesRegex(SystemExit, "Legacy"), collector.collection_lock(root):
                pass
