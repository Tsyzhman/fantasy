import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../../scripts/configure-production-amneziawg.sh", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/configure-production-fpl-vpn.yml", import.meta.url), "utf8");
const deployWorkflow = readFileSync(new URL("../../.github/workflows/deploy-production.yml", import.meta.url), "utf8");

test("production AmneziaWG promotion uses an official immutable image and a candidate probe", () => {
  assert.match(script, /amneziavpn\/amneziawg-go@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(script, /amneziawg-go:latest/);
  assert.match(script, /--cap-drop ALL \\\n\s+--cap-add DAC_OVERRIDE \\\n\s+--cap-add NET_ADMIN/);
  assert.match(script, /dst=\/etc\/amnezia\/amneziawg\/awg0\.conf,readonly/);
  assert.match(script, /--sysctl net\.ipv4\.conf\.all\.src_valid_mark=1/);
  assert.match(script, /src_valid_mark=1[\s\S]+\/proc\/sys\/net\/ipv4\/conf\/all\/src_valid_mark[\s\S]+command sysctl/);
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
  assert.match(script, /config_root="\/var\/backups\/fantasy-scout\/fpl-vpn-config"/);
  assert.match(interfaceAllowlist, /PrivateKey/);
  assert.doesNotMatch(interfaceAllowlist, /(?:Pre|Post)(?:Up|Down)/);
  assert.doesNotMatch(workflow, /PrivateKey\s*=/);
  assert.doesNotMatch(script, /PrivateKey\s*=[A-Za-z0-9+/]/);
});

test("the existing production workflow can rotate AmneziaWG before promotion", () => {
  assert.match(deployWorkflow, /configure_fpl_vpn:/);
  assert.match(deployWorkflow, /inputs\.configure_fpl_vpn == 'true'/);
  assert.match(deployWorkflow, /scripts\/configure-production-amneziawg\.sh/);
  assert.ok(
    deployWorkflow.indexOf("Promote verified AmneziaWG network namespace")
      < deployWorkflow.indexOf("Promote Docker release")
  );
});
