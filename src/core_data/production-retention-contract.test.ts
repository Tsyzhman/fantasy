import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const deployScript = readFileSync(join(repositoryRoot, "scripts", "deploy-production-docker.sh"), "utf8");
const retentionScript = readFileSync(join(repositoryRoot, "scripts", "prune-production-artifacts.sh"), "utf8");

test("production deploy automatically applies bounded retention after promotion", () => {
  const promotionIndex = deployScript.indexOf('phase="deployed"');
  const retentionIndex = deployScript.indexOf('"$target/scripts/prune-production-artifacts.sh" --apply');

  assert.ok(promotionIndex >= 0, "deployment must record the successful promotion phase");
  assert.ok(retentionIndex > promotionIndex, "retention must run only after production has been promoted");
});

test("production retention keeps current plus one rollback release by default", () => {
  assert.match(retentionScript, /keep_recent="\$\{FANTASY_RELEASE_KEEP_RECENT:-2\}"/);
  assert.match(retentionScript, /KEEP_ROLLBACK=/);
  assert.match(retentionScript, /docker builder prune --force --max-used-space "\$build_cache_limit"/);
});
