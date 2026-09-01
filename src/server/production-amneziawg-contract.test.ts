import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(
  new URL("../../scripts/configure-production-amneziawg.sh", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL(
    "../../.github/workflows/configure-production-fpl-vpn.yml",
    import.meta.url,
  ),
  "utf8",
);
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);

test("production AmneziaWG promotion uses the reviewed immutable AWG2 client and a candidate probe", () => {
  assert.match(
    script,
    /ghcr\.io\/ayastrebov\/docker-amneziawg@sha256:cac6c54caf5d749267386629cd827fc711524092156cd8097c8f464797a903be/,
  );
  assert.match(
    script,
    /awg_image_revision="cb83840e9d34a5e0d6b874dcb42bc2ca23cd3ea4"/,
  );
  assert.doesNotMatch(script, /docker-amneziawg:(?:latest|master|1(?:\.0)?)/);
  assert.match(
    script,
    /--mount "type=volume,src=\$candidate_config_volume,dst=\/config"/,
  );
  assert.match(script, /\/config\/wg_confs\/awg0\.conf/);
  assert.match(script, /--cap-add NET_ADMIN/);
  assert.match(script, /--device \/dev\/net\/tun/);
  assert.match(script, /--sysctl net\.ipv4\.conf\.all\.src_valid_mark=1/);
  assert.match(script, /--sysctl net\.ipv4\.ip_forward=1/);
  assert.doesNotMatch(script, /--cap-add SYS_MODULE|--privileged/);
  assert.match(
    script,
    /timeout --signal=TERM --kill-after=5s 15s docker run --rm/,
  );
  assert.match(script, /handshake=%s rxBytes=%s txBytes=%s/);
  assert.match(script, /Removed stale bounded AmneziaWG candidate/);
  assert.match(script, /Removed stale bounded AmneziaWG config volume/);
  assert.ok(
    script.indexOf('probe_vpn_namespace "$candidate_container"') <
      script.indexOf('docker container stop -t 20 "$vpn_container"'),
  );
  assert.match(script, /restore_old_runtime/);
  assert.match(script, /fplProbe/);
  assert.match(script, /AMNEZIAWG_VALIDATE_ONLY/);
  assert.match(script, /AMNEZIAWG_ALLOW_BOOTSTRAP/);
  assert.match(script, /guarded bootstrap is enabled/);
  assert.ok(
    script.indexOf('probe_vpn_namespace "$candidate_container"') <
      script.lastIndexOf('docker container rm -f "$relay_container"'),
  );
});

test("production AmneziaWG config stays secret, bounded, and serialized with deploys", () => {
  const interfaceAllowlist =
    script.match(/interface_allowed = "([^"]+)"/)?.[1] ?? "";
  assert.match(workflow, /secrets\.FPL_AMNEZIAWG_CONFIG/);
  assert.match(workflow, /group: production-deploy/);
  assert.match(workflow, /AMNEZIAWG_ALLOW_BOOTSTRAP=1/);
  assert.match(script, /chmod 600 "\$uploaded_config"/);
  assert.match(
    script,
    /config_root="\/var\/backups\/fantasy-scout\/fpl-vpn-config"/,
  );
  assert.match(script, /com\.fantasy-scout\.role=fpl-vpn-config/);
  assert.match(script, /cat > \/config\/wg_confs\/awg0\.conf/);
  assert.doesNotMatch(script, /if \(\$0 !~ .*DNS/);
  assert.match(interfaceAllowlist, /PrivateKey/);
  assert.doesNotMatch(interfaceAllowlist, /(?:Pre|Post)(?:Up|Down)/);
  assert.doesNotMatch(workflow, /PrivateKey\s*=/);
  assert.doesNotMatch(script, /PrivateKey\s*=[A-Za-z0-9+/]/);
});

test("the existing production workflow can rotate AmneziaWG before promotion", () => {
  assert.match(deployWorkflow, /configure_fpl_vpn:/);
  assert.match(deployWorkflow, /inputs\.configure_fpl_vpn == 'true'/);
  assert.match(deployWorkflow, /scripts\/configure-production-amneziawg\.sh/);
  assert.match(deployWorkflow, /AMNEZIAWG_ALLOW_BOOTSTRAP=1/);
  assert.match(deployWorkflow, /ServerAliveInterval=15/);
  assert.match(
    deployWorkflow,
    /timeout --signal=TERM --kill-after=30s 5m bash -s/,
  );
  assert.ok(
    deployWorkflow.indexOf("Promote verified AmneziaWG network namespace") <
      deployWorkflow.indexOf("Promote Docker release"),
  );
});
