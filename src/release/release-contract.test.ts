import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { releaseIdentity } from "../lib/release-identity";
import { withEnv } from "../test-utils/env";

const repositoryRoot = new URL("../../", import.meta.url);

test("release identity has explicit safe development fallbacks", async () => {
  await withEnv({ APP_RELEASE_VERSION: undefined, APP_RELEASE_COMMIT: undefined }, () => {
    assert.deepEqual(releaseIdentity(), { version: "development", commit: "unknown" });
  });
});

test("Docker runtime carries the same version and commit in env and OCI labels", () => {
  const dockerfile = source("Dockerfile");

  assert.match(dockerfile, /ARG APP_RELEASE_VERSION=development/);
  assert.match(dockerfile, /ARG APP_RELEASE_COMMIT=unknown/);
  assert.match(dockerfile, /org\.opencontainers\.image\.version="\$\{APP_RELEASE_VERSION\}"/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{APP_RELEASE_COMMIT\}"/);
  assert.match(dockerfile, /ENV APP_RELEASE_VERSION="\$\{APP_RELEASE_VERSION\}"/);
  assert.match(dockerfile, /ENV APP_RELEASE_COMMIT="\$\{APP_RELEASE_COMMIT\}"/);
});

test("production workflow packages committed Git source and never deploys the legacy PM2 checkout", () => {
  const workflow = source(".github/workflows/deploy-production.yml");

  assert.match(workflow, /git merge-base --is-ancestor origin\/main HEAD/);
  assert.match(workflow, /npm run release:verify-source -- --ci/);
  assert.match(workflow, /git archive --format=tar\.gz/);
  assert.match(workflow, /scripts\/deploy-production-docker\.sh/);
  assert.match(workflow, /Reject production history rollback/);
  assert.doesNotMatch(workflow, /\bgit pull\b/);
  assert.doesNotMatch(workflow, /\bpm2\b/i);
});

test("production fantasy price sync is an exact, non-runtime operator job", () => {
  const workflow = source(".github/workflows/sync-production-fantasy-prices.yml");
  const runner = source("scripts/sync-production-fantasy-prices.sh");
  const entrypoint = source("scripts/sync-production-fantasy-prices.ts");

  assert.match(workflow, /git merge-base --is-ancestor origin\/main HEAD/);
  assert.match(workflow, /git archive --format=tar\.gz/);
  assert.match(workflow, /scripts\/sync-production-fantasy-prices\.sh/);
  assert.match(runner, /sha256sum/);
  assert.match(runner, /--target setup/);
  assert.match(runner, /npm run prices:sync-fpl-and-epl/);
  assert.match(runner, /--network fantasy-scout_default/);
  assert.match(runner, /--network "container:\$vpn_container"/);
  assert.match(runner, /FPL_RELAY_SOCKET_PATH=\$relay_socket/);
  assert.match(runner, /type=volume,src=\$relay_volume,dst=\/run\/fpl-relay/);
  assert.doesNotMatch(runner, /docker network connect/);
  assert.match(runner, /--cap-drop ALL/);
  assert.match(runner, /--security-opt no-new-privileges:true/);
  assert.match(runner, /scripts\/fpl-vpn-relay\.mjs/);
  assert.match(entrypoint, /syncFplPrices/);
  assert.match(entrypoint, /syncSportsRuFantasy/);
  assert.match(entrypoint, /tournamentHru: "england"/);
  assert.doesNotMatch(runner, /docker container restart/);
  assert.doesNotMatch(runner, /docker compose (up|down)/);
});

test("server promoter verifies formula files, rehearses migrations, and checks exact runtime commit", () => {
  const promoter = source("scripts/deploy-production-docker.sh");

  assert.match(promoter, /src\/machete\/formula_adaptations\.ts/);
  assert.match(promoter, /Verified production backup/);
  assert.match(promoter, /Migration rehearsal did not apply the complete migration set/);
  assert.match(promoter, /npm run prisma:migrate:deploy/);
  assert.match(promoter, /run_docker_build "Runtime"/);
  assert.match(promoter, /run_docker_build "Migration setup"/);
  assert.match(promoter, /migration_in_list/);
  assert.doesNotMatch(promoter, /cat "\$backup_path" \| docker exec/);
  assert.match(promoter, /run_canary "Pre-migration"/);
  assert.match(promoter, /run_canary "Post-migration"/);
  assert.match(promoter, /FPL_PRICE_SYNC_ENABLED=false/);
  assert.match(promoter, /schema_migration_started/);
  assert.match(promoter, /status IN \('queued','running'\)/);
  assert.match(promoter, /p\.release\?\.commit===process\.argv\[1\]/);
  assert.match(promoter, /PRODUCTION_HISTORY\.tsv/);
  assert.match(promoter, /rollback_swap/);
  assert.match(promoter, /start_fpl_relay "\$fpl_relay_candidate" "\$fpl_relay_candidate_volume"/);
  assert.match(promoter, /wait_for_fpl_relay "\$fpl_relay_candidate_volume" 100000/);
  assert.match(promoter, /--network "container:\$fpl_vpn_container"/);
  assert.match(promoter, /FPL_RELAY_SOCKET_PATH=\$fpl_relay_socket/);
  assert.match(promoter, /type=volume,src=\$fpl_relay_volume,dst=\/run\/fpl-relay,readonly/);
  assert.doesNotMatch(promoter, /docker network connect/);
  assert.match(promoter, /fpl_relay_rollback="fantasy-scout-fpl-relay-rollback-pre-\$release"/);
  assert.match(promoter, /old_fpl_relay_renamed/);
  assert.match(promoter, /"\$release" > "\$target\/\.release-name"/);
  assert.match(promoter, /"\$version" > "\$target\/\.release-version"/);
  assert.match(promoter, /if \[\[ "\$phase" == "deployed" \]\]; then\s+exit "\$exit_code"/);
  assert.match(promoter, /mv -Tf "\$link_tmp" "\$current_link"\s+phase="deployed"/);
  assert.match(promoter, /fantasy-scout-current-rollback-\$release/);
});

test("release-source verifier requires every formula runtime artifact to be tracked", () => {
  const verifier = source("scripts/verify-release-source.mjs");

  for (const required of [
    "src/app/api/machete/squads/formula-adaptations/route.ts",
    "scripts/fpl-vpn-relay.mjs",
    "src/components/machete/FormulaAdaptationHoverCard.tsx",
    "src/machete/formula-adaptation-models.generated.json",
    "src/machete/formula_adaptations.ts"
  ]) {
    assert.match(verifier, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(verifier, /Release source is dirty/);
  assert.match(verifier, /is not present on an origin remote ref/);
});

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, repositoryRoot), "utf8");
}
