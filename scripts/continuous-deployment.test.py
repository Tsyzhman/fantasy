#!/usr/bin/env python3
"""@spec spec://common/INFRA-006-continuous-deployment#acceptance"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


routing = load("production_web_routing", "production-web-routing.py")
migrations = load("online_migrations", "check-online-migrations.py")
CONFIG = '''(shared) {
    header X-Trace "literal } brace"
}
other.example {
    reverse_proxy 127.0.0.1:3000
}
fantasy.tsyzhman.ru {
    import shared
    # Ignore a comment with an unmatched { brace
    handle_path /_monitor/* {
        file_server
    }
    reverse_proxy 127.0.0.1:3000 {
        lb_try_duration 2s
    }
}
'''


class RoutingTests(unittest.TestCase):
    def test_switch_preserves_other_sites_monitoring_and_reverse_switch(self):
        switched = routing.render_upstream(CONFIG, 3000, 3001)
        self.assertEqual(routing.current_port(switched), 3001)
        self.assertEqual(switched.count("reverse_proxy 127.0.0.1:3000"), 1)
        self.assertEqual(routing.render_upstream(switched, 3001, 3000), CONFIG)

    def test_refuses_unexpected_or_ambiguous_upstreams(self):
        for source in (CONFIG.replace("fantasy.tsyzhman.ru", "missing.example"),
                       CONFIG + CONFIG, CONFIG.replace(":3000 {", ":4000 {"),
                       CONFIG.replace(":3000 {", ":3000 127.0.0.1:3001 {")):
            with self.assertRaises(ValueError):
                routing.render_upstream(source, 3000, 3001)
        with self.assertRaises(ValueError):
            routing.render_upstream(CONFIG, 3001, 3000)

    def test_validation_failure_does_not_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            path.write_text(CONFIG, encoding="utf-8", newline="\n")
            def fail(_):
                raise RuntimeError("invalid config")
            with self.assertRaises(RuntimeError):
                routing.switch_upstream(path, 3000, 3001, fail)
            self.assertEqual(path.read_text(encoding="utf-8"), CONFIG)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_reload_failure_restores_original_file_and_reload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            path.write_text(CONFIG, encoding="utf-8", newline="\n")
            calls = []
            def run(args):
                calls.append(args[0])
                if calls == ["validate", "reload"]:
                    self.assertEqual(routing.current_port(path.read_text(encoding="utf-8")), 3001)
                    raise RuntimeError("admin unavailable once")
            with self.assertRaisesRegex(RuntimeError, "original upstream was restored"):
                routing.switch_upstream(path, 3000, 3001, run)
            self.assertEqual(calls, ["validate", "reload", "reload"])
            self.assertEqual(path.read_text(encoding="utf-8"), CONFIG)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_success_validates_before_atomic_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            path.write_text(CONFIG, encoding="utf-8", newline="\n")
            calls = []
            def run(args):
                calls.append(args[0])
                expected = 3000 if args[0] == "validate" else 3001
                self.assertEqual(routing.current_port(path.read_text(encoding="utf-8")), expected)
            routing.switch_upstream(path, 3000, 3001, run)
            self.assertEqual(calls, ["validate", "reload"])
            self.assertEqual(routing.current_port(path.read_text(encoding="utf-8")), 3001)

    def test_concurrent_config_edit_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            path.write_text(CONFIG, encoding="utf-8", newline="\n")
            concurrent = CONFIG + "# independent operator edit\n"
            def run(_):
                path.write_text(concurrent, encoding="utf-8", newline="\n")
            with self.assertRaisesRegex(RuntimeError, "changed concurrently"):
                routing.switch_upstream(path, 3000, 3001, run)
            self.assertEqual(path.read_text(encoding="utf-8"), concurrent)


class MigrationTests(unittest.TestCase):
    def test_only_exact_reviewed_online_sql_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration = root / "20261009_online"
            migration.mkdir()
            sql = b"SELECT 1;\n"
            (migration / "migration.sql").write_bytes(sql)
            with self.assertRaisesRegex(ValueError, "no reviewed"):
                migrations.validate_migrations(root, [migration.name])
            policy = {"mode": "online", "sqlSha256": hashlib.sha256(sql).hexdigest()}
            (migration / "deployment.json").write_text(json.dumps(policy), encoding="utf-8")
            self.assertEqual(migrations.validate_migrations(root, [migration.name]), 1)
            (migration / "migration.sql").write_bytes(b"DROP TABLE users;\n")
            with self.assertRaisesRegex(ValueError, "not approved"):
                migrations.validate_migrations(root, [migration.name])
            policy["mode"] = "offline"
            (migration / "deployment.json").write_text(json.dumps(policy), encoding="utf-8")
            with self.assertRaises(ValueError):
                migrations.validate_migrations(root, [migration.name])
            with self.assertRaises(ValueError):
                migrations.validate_migrations(root, ["../escape"])

    def test_shipped_corrective_migration_is_reviewed_and_historical_is_refused(self):
        root = ROOT.parent / "prisma" / "migrations"
        self.assertEqual(migrations.validate_migrations(root, ["20261009145000_four_leagues_two_players_per_club"]), 1)
        with self.assertRaisesRegex(ValueError, "no reviewed"):
            migrations.validate_migrations(root, ["20261009140500_four_leagues_three_players_per_club"])


HARNESS = r'''
set -Eeuo pipefail
source "$1"
scenario="$2"
web=web; worker=worker; fpl_relay=relay
web_candidate=web_candidate; fpl_relay_candidate=relay_candidate
web_rollback=web_old; worker_rollback=worker_old; fpl_relay_rollback=relay_old
commit=new; old_commit=old; old_port=3000; candidate_port=3001; route=3000
old_web_renamed=0; old_worker_renamed=0; old_fpl_relay_renamed=0
candidate_web_promoted=0; candidate_relay_promoted=0; new_worker_created=0; traffic_switched=0
phase=prepare
trap 'exit 143' TERM
declare -A states=([web]=running [web_candidate]=running [worker]=running [relay]=running [relay_candidate]=running)
declare -A roles=([web]=web [web_candidate]=web [worker]=worker [relay]=relay [relay_candidate]=relay)
declare -A ports=([web]=3000 [web_candidate]=3001 [worker]=none [relay]=none [relay_candidate]=none)
audit() {
  local serving=0 workers=0 name
  for name in "${!states[@]}"; do
    if [[ "${states[$name]}" == running && "${roles[$name]}" == web && "${ports[$name]}" == "$route" ]]; then serving=$((serving+1)); fi
    if [[ "${states[$name]}" == running && "${roles[$name]}" == worker ]]; then workers=$((workers+1)); fi
  done
  [[ "$serving" -ge 1 && "$workers" -le 1 ]] || { echo "CONTINUITY_OR_DUPLICATE_FAILURE"; return 9; }
}
docker() {
  [[ "$1" == container ]]; shift
  local operation="$1"; shift
  local name="${@: -1}"
  case "$operation" in
    rename)
      local old="$1" new="$2"
      [[ -n "${states[$old]:-}" && -z "${states[$new]:-}" ]]
      states[$new]="${states[$old]}"; roles[$new]="${roles[$old]}"; ports[$new]="${ports[$old]}"
      unset 'states[$old]' 'roles[$old]' 'ports[$old]';;
    stop) states[$name]=exited;;
    start) states[$name]=running;;
    rm) unset 'states[$name]' 'roles[$name]' 'ports[$name]';;
    update) return 0;;
    inspect)
      if [[ "$*" == *RestartCount* ]]; then echo 0; else [[ "${states[$1]}" == running ]] && echo true || echo false; fi
      return 0;;
    *) echo "Unexpected docker operation: $operation"; return 8;;
  esac
  audit
}
create_production_worker() { states[worker]=created; roles[worker]=worker; ports[worker]=none; audit; }
wait_for_release() {
  [[ "${states[$1]}" == running ]]
  if [[ "$scenario" == web_failure && "$1" == web_candidate ]]; then return 1; fi
  if [[ "$scenario" == worker_failure && "$1" == worker ]]; then return 1; fi
}
switch_web_traffic() {
  [[ "$route" == "$1" ]]
  if [[ "$scenario" == routing_failure && "$2" == 3001 ]]; then return 1; fi
  route="$2"; audit
}
probe_public_release() {
  [[ "$route" == 3001 && "$1" == new || "$route" == 3000 && "$1" == old ]]
  if [[ "$scenario" == public_failure && "$1" == new ]]; then return 1; fi
  if [[ "$scenario" == public_terminate && "$1" == new ]]; then kill -TERM "$$"; fi
  audit
}
sleep() { [[ "$route" == 3001 ]]; audit; }
finish() {
  local code=$?
  trap - EXIT
  set +e
  if (( code != 0 )) && [[ "$phase" == swap ]]; then rollback_swap || exit 7; fi
  audit || exit 9
  echo "FINAL_ROUTE=$route WEB=${states[web]} WORKER=${states[worker]} CODE=$code"
  exit "$code"
}
trap finish EXIT
audit
wait_for_release "$web_candidate" "$commit"
promote_running_candidate
phase=deployed
drain_previous_runtime
'''


class RolloutTests(unittest.TestCase):
    def run_scenario(self, scenario):
        git_bash = Path("C:/Program Files/Git/bin/bash.exe")
        bash = str(git_bash) if os.name == "nt" and git_bash.is_file() else shutil.which("bash")
        self.assertIsNotNone(bash)
        return subprocess.run([bash, "-c", HARNESS, "rollout-test", str(ROOT / "production-rollout.sh"), scenario],
                              capture_output=True, text=True, timeout=15)

    def test_success_keeps_serving_web_and_one_worker_through_all_operations(self):
        result = self.run_scenario("success")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("FINAL_ROUTE=3001 WEB=running WORKER=running CODE=0", result.stdout)

    def test_failures_restore_serving_old_version_without_duplicate_workers(self):
        for scenario in ("web_failure", "worker_failure", "routing_failure", "public_failure", "public_terminate"):
            with self.subTest(scenario=scenario):
                result = self.run_scenario(scenario)
                self.assertNotEqual(result.returncode, 0)
                code = 143 if scenario == "public_terminate" else 1
                self.assertIn(f"FINAL_ROUTE=3000 WEB=running WORKER=running CODE={code}", result.stdout, result.stdout + result.stderr)
                self.assertNotIn("CONTINUITY_OR_DUPLICATE_FAILURE", result.stdout)


if __name__ == "__main__":
    unittest.main()
