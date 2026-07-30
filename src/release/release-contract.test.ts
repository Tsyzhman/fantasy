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

test("server promoter verifies formula files, migrations, active jobs, and exact runtime commit", () => {
  const promoter = source("scripts/deploy-production-docker.sh");

  assert.match(promoter, /src\/machete\/formula_adaptations\.ts/);
  assert.match(promoter, /Refusing application deploy with unapplied migration/);
  assert.match(promoter, /status IN \('queued','running'\)/);
  assert.match(promoter, /p\.release\?\.commit===process\.argv\[1\]/);
  assert.match(promoter, /PRODUCTION_HISTORY\.tsv/);
  assert.match(promoter, /rollback_swap/);
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
