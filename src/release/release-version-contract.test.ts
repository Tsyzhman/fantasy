import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const verifier = fileURLToPath(new URL("../../scripts/verify-release-version.mjs", import.meta.url));

test("release version verifier accepts synchronized release files", () => {
  withFixture((root) => {
    writeRelease(root, "0.3.25", ["0.3.25"]);
    const result = runVerifier(root);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: "ok",
      version: "0.3.25",
      releaseDate: "2026-08-24",
      baseVersion: null,
      changedPathCount: 0,
    });
  });
});

test("release version verifier rejects manifest, lock, and changelog drift", async (context) => {
  await context.test("top-level lock version", () => {
    withFixture((root) => {
      writeRelease(root, "0.3.25", ["0.3.25"], { lockVersion: "0.3.24" });
      assert.match(runVerifier(root).stderr, /top-level version "0\.3\.24" does not match 0\.3\.25/);
    });
  });

  await context.test("root-package lock version", () => {
    withFixture((root) => {
      writeRelease(root, "0.3.25", ["0.3.25"], { rootVersion: "0.3.24" });
      assert.match(runVerifier(root).stderr, /root package version "0\.3\.24" does not match 0\.3\.25/);
    });
  });

  await context.test("newest changelog version", () => {
    withFixture((root) => {
      writeRelease(root, "0.3.25", ["0.3.24"]);
      assert.match(runVerifier(root).stderr, /newest version 0\.3\.24 does not match 0\.3\.25/);
    });
  });
});

test("release version verifier requires a newer synchronized version for a change set", () => {
  withFixture((root) => {
    writeRelease(root, "0.3.24", ["0.3.24"]);
    writeFileSync(join(root, "app.txt"), "before\n", "utf8");
    git(root, ["init"]);
    git(root, ["config", "user.email", "release-test@example.invalid"]);
    git(root, ["config", "user.name", "Release Test"]);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "base"]);

    writeFileSync(join(root, "app.txt"), "after\n", "utf8");
    const unchangedVersion = runVerifier(root, ["--base", "HEAD"]);
    assert.notEqual(unchangedVersion.status, 0);
    assert.match(unchangedVersion.stderr, /Version 0\.3\.24 must be newer than base version 0\.3\.24/);

    writeRelease(root, "0.3.25", ["0.3.25", "0.3.24"]);
    const bumpedVersion = runVerifier(root, ["--base", "HEAD"]);
    assert.equal(bumpedVersion.status, 0, bumpedVersion.stderr);
    assert.equal(JSON.parse(bumpedVersion.stdout).baseVersion, "0.3.24");
  });
});

function writeRelease(
  root: string,
  manifestVersion: string,
  changelogVersions: string[],
  overrides: { lockVersion?: string; rootVersion?: string } = {},
) {
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "release-fixture", version: manifestVersion }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "package-lock.json"),
    `${JSON.stringify({
      name: "release-fixture",
      version: overrides.lockVersion ?? manifestVersion,
      lockfileVersion: 3,
      packages: { "": { name: "release-fixture", version: overrides.rootVersion ?? manifestVersion } },
    }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "CHANGELOG.md"),
    `# Changelog\n\n${changelogVersions.map((version) => `## ${version} - 2026-08-24\n`).join("\n")}`,
    "utf8",
  );
}

function runVerifier(root: string, argumentsList: string[] = []) {
  return spawnSync(process.execPath, [verifier, ...argumentsList], {
    cwd: root,
    encoding: "utf8",
  });
}

function git(root: string, argumentsList: string[]) {
  execFileSync("git", argumentsList, { cwd: root, stdio: "ignore" });
}

function withFixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "fantasy-release-version-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
