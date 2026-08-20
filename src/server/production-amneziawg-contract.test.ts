import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../scripts/configure-production-amneziawg.sh", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/configure-production-fpl-vpn.yml", import.meta.url), "utf8");

test("production AmneziaWG promotion uses an official immutable image and a candidate probe", () => {
  assert.match(script, /amneziavpn\/amneziawg-go@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(script, /amneziawg-go:latest/);
  assert.ok(script.indexOf("probe_vpn_namespace \"$candidate_container\"") < script.indexOf("docker container stop -t 20 \"$vpn_container\""));
  assert.match(script, /restore_old_runtime/);
  assert.match(script, /fplProbe/);
  assert.match(script, /AMNEZIAWG_VALIDATE_ONLY/);
});

test("production AmneziaWG config stays secret, bounded, and serialized with deploys", () => {
  const interfaceAllowlist = script.match(/interface_allowed = "([^"]+)"/)?.[1] ?? "";
  assert.match(workflow, /secrets\.FPL_AMNEZIAWG_CONFIG/);
  assert.match(workflow, /group: production-deploy/);
  assert.match(script, /chmod 600 "\$uploaded_config"/);
  assert.match(script, /config_root="\/etc\/fantasy-scout\/fpl-vpn"/);
  assert.match(interfaceAllowlist, /PrivateKey/);
  assert.doesNotMatch(interfaceAllowlist, /(?:Pre|Post)(?:Up|Down)/);
  assert.doesNotMatch(workflow, /PrivateKey\s*=/);
  assert.doesNotMatch(script, /PrivateKey\s*=[A-Za-z0-9+/]/);
});
