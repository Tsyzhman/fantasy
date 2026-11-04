// @spec spec://common/INFRA-006-continuous-deployment#contracts
// @spec spec://common/INFRA-006-continuous-deployment#runtime
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertReleaseRevision } from "./verify-release-revision.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const deploy = read(".github/workflows/deploy-production.yml");
const check = read(".github/workflows/check.yml");
const candidate = "1234567890abcdef1234567890abcdef12345678";
const other = "abcdef1234567890abcdef1234567890abcdef12";

function job(source, id) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${id}:`);
  assert.notEqual(start, -1, `Missing job ${id}`);
  let end = start + 1;
  while (end < lines.length && !/^  [a-z][a-z0-9-]*:/.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n");
}

test("only the full resolved SHA identifies validation and packaging", () => {
  assert.equal(assertReleaseRevision(candidate, candidate), candidate);
  for (const value of [undefined, "", "main", "refs/heads/main", candidate.slice(0, 7), candidate.toUpperCase(), `${candidate}\n`]) {
    assert.throws(() => assertReleaseRevision(value, candidate), /full lowercase commit SHA/);
  }
  assert.throws(() => assertReleaseRevision(candidate, other), /does not match HEAD/);
});

test("the revision CLI rejects a different checkout before packaging", () => {
  // A detached fixture prevents another process moving the shared checkout from racing this test.
  const current = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const objects = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "objects"], { cwd: root, encoding: "utf8" }).trim();
  const temporaryParent = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(temporaryParent, "fantasy-release-revision-"));
  try {
    execFileSync("git", ["init", "--bare", fixture], { stdio: "pipe" });
    writeFileSync(join(fixture, "HEAD"), `${current}\n`);
    writeFileSync(join(fixture, "objects", "info", "alternates"), `${objects}\n`);
    const cli = fileURLToPath(new URL("./verify-release-revision.mjs", import.meta.url));
    const run = (expected) => spawnSync(process.execPath, [cli, expected], { cwd: fixture, encoding: "utf8" });
    const accepted = run(current);
    assert.equal(accepted.status, 0, accepted.stderr);
    const rejected = run(current === candidate ? other : candidate);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /does not match HEAD/);
  } finally {
    assert.equal(dirname(fixture), temporaryParent);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("source verifier rejects missing, ambiguous and non-CI revision overrides", () => {
  for (const args of [
    ["--ci", "--expected-commit"],
    ["--ci", "--expected-commit", "main"],
    ["--ci", "--expected-commit", candidate, "--expected-commit", candidate],
    ["--expected-commit", candidate],
  ]) {
    const result = spawnSync(process.execPath, ["scripts/verify-release-source.mjs", ...args], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--expected-commit/);
  }
  assert.match(read("scripts/verify-release-source.mjs"), /assertReleaseRevision\(expectedCommit \?\? process\.env\.GITHUB_SHA\?\.trim\(\), commit\)/);
});

test("packaging requires a fresh full validation of the same frozen source", () => {
  assert.match(check, /^  workflow_call:$/m);
  const resolve = job(deploy, "resolve-source");
  assert.match(resolve, /ref: \$\{\{ inputs\.ref \}\}/);
  assert.match(resolve, /git merge-base --is-ancestor origin\/main HEAD/);
  assert.match(resolve, /commit=\$\(git rev-parse HEAD\)/);
  assert.match(resolve, /version_base=\$\(git rev-parse origin\/main\)/);
  const validation = job(deploy, "validate-source");
  assert.match(validation, /^    needs: resolve-source$/m);
  assert.match(validation, /^    uses: \.\/\.github\/workflows\/check\.yml$/m);
  assert.match(validation, /ref: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(validation, /version_base: \$\{\{ needs\.resolve-source\.outputs\.version_base \}\}/);
  assert.doesNotMatch(validation, /continue-on-error|if:/);
  const packageJob = job(deploy, "package-and-deploy");
  assert.match(packageJob, /^    needs: \[resolve-source, validate-source\]$/m);
  assert.doesNotMatch(packageJob, /^    if:|^    continue-on-error:/m);
  assert.match(packageJob, /ref: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(packageJob, /EXPECTED_COMMIT: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(packageJob, /release:verify-source -- --ci --expected-commit "\$EXPECTED_COMMIT"/);
  assert.doesNotMatch(packageJob, /ref: \$\{\{ inputs\.ref \}\}/);
  assert.doesNotMatch(deploy, /workflow_run|check-runs|actions\/runs/);
  assert.doesNotMatch(packageJob, /unittest discover|pip install|scripts\/continuous-deployment\.test\.py/);
});

test("the reusable validator keeps every required check mandatory", () => {
  const validation = job(check, "check");
  assert.match(validation, /ref: \$\{\{ inputs\.ref \|\| github\.sha \}\}/);
  assert.match(validation, /EXPECTED_COMMIT: \$\{\{ inputs\.ref \|\| github\.sha \}\}/);
  assert.match(validation, /node scripts\/verify-release-revision\.mjs "\$EXPECTED_COMMIT"/);
  for (const required of [
    "npm ci --no-audit --no-fund", "npm run prisma:generate", "npm run audit:prod",
    "npm run prisma:migrate:diff", "run_database_tests fantasy_scout_test_ci common_tests false",
    "run_database_tests fantasy_auth_test_ci auth_tests false", "run_database_tests fantasy_betting_test_ci betting_tests false",
    "run_database_tests khl_test_ci khl_tests true", "npm run check",
    "npx playwright install --with-deps chromium",
    "unset PLAYWRIGHT_CHANNEL UI_KEYBOARD_SOURCE_REVISION",
    "npx playwright test --config e2e/ui-keyboard.config.ts --forbid-only",
    "python3 scripts/runtime-database-roles.test.py", "python3 -B scripts/continuous-deployment.test.py",
    "python3 -B scripts/prepare-deploy-ssh.test.py", "scripts/release-validation.test.mjs",
    "python3 -B scripts/khl-protocol-http.test.py", "python3 -B scripts/configure-production-amneziawg.test.py",
    "python3 -m pip install --no-cache-dir -r scripts/franchise-analytics/requirements.txt",
    "python3 -B -m unittest discover -s scripts/franchise-analytics -p 'test_*.py'",
  ]) assert.ok(validation.includes(required), `Missing required validation: ${required}`);
  assert.doesNotMatch(validation, /continue-on-error|if:/);
  const manifest = JSON.parse(read("package.json"));
  for (const required of ["test", "lint", "typecheck", "build"]) assert.ok(manifest.scripts.check.includes(`npm run ${required}`));
});

test("CI and all three official base stages use the same exact patched Node", () => {
  const version = read(".nvmrc").trim();
  assert.equal(version, "24.22.2");
  const pins = [...read("Dockerfile").matchAll(/^FROM node:([^ ]+) AS (deps|khl-http|runtime)$/gm)];
  assert.equal(pins.length, 3);
  for (const pin of pins) assert.equal(pin[1], `${version}-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`);
  assert.match(deploy, /for image_id in "\$runtime_id" "\$setup_id"/);
  assert.ok(deploy.includes('process.version!=="v"+process.argv[1]'));
  assert.ok(deploy.includes('"$(cat .nvmrc)"'));
  assert.ok(deploy.includes('if(process.getuid()===0)process.exit(1)'));
  assert.match(check, /node-version-file: \.nvmrc/);
});

test("every production SSH and SCP call uses the isolated strict host configuration", () => {
  for (const filename of ["deploy-production.yml", "configure-production-fpl-vpn.yml", "sync-production-fantasy-prices.yml"]) {
    const source = read(`.github/workflows/${filename}`);
    assert.match(source, /environment: production/);
    assert.match(source, /DEPLOY_KNOWN_HOSTS: \$\{\{ secrets\.DEPLOY_KNOWN_HOSTS \}\}/);
    assert.match(source, /run: python3 -B scripts\/prepare-deploy-ssh\.py/);
    assert.doesNotMatch(source, /ssh-keyscan|StrictHostKeyChecking=no|StrictHostKeyChecking=accept-new/);
    const calls = source.split(/\r?\n/).filter((line) => /^\s+(ssh|scp) /.test(line));
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.match(call, /^\s+(ssh|scp) -F ~\/\.ssh\/deploy_config /);
      assert.equal(call.match(/-F /g).length, 1);
    }
    assert.match(source, /if: always\(\)\n\s+run: rm -f -- ~\/\.ssh\/deploy_key ~\/\.ssh\/deploy_known_hosts ~\/\.ssh\/deploy_config/);
  }
});
