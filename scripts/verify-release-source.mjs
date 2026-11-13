#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertReleaseRevision } from "./verify-release-revision.mjs";

// @spec spec://common/INFRA-006-continuous-deployment#contracts

const argumentsList = process.argv.slice(2);
let allowUnpushed = false;
let ciMode = false;
let expectedCommit;
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === "--allow-unpushed") allowUnpushed = true;
  else if (argument === "--ci") ciMode = true;
  else if (argument === "--expected-commit") {
    if (expectedCommit !== undefined) fail("--expected-commit may be provided only once.");
    expectedCommit = argumentsList[++index];
    if (!/^[0-9a-f]{40}$/.test(expectedCommit ?? "")) fail("--expected-commit requires a full lowercase commit SHA.");
  } else fail(`Unknown argument: ${argument}`);
}
if (expectedCommit !== undefined && !ciMode) fail("--expected-commit requires --ci.");

const requiredTrackedFiles = [
  "CHANGELOG.md",
  ".github/workflows/deploy-production.yml",
  ".github/workflows/check.yml",
  "scripts/verify-release-revision.mjs",
  "scripts/release-validation.test.mjs",
  "scripts/prepare-deploy-ssh.py",
  "scripts/prepare-deploy-ssh.test.py",
  "Dockerfile",
  "package-lock.json",
  "package.json",
  "scripts/archive-release-source.sh",
  "scripts/deploy-production-docker.sh",
  "scripts/production-rollout.sh",
  "scripts/production-web-routing.py",
  "scripts/check-online-migrations.py",
  "scripts/continuous-deployment.test.py",
  "src/server/web-scheduler-activation.ts",
  "scripts/fpl-vpn-relay.mjs",
  "scripts/prune-production-artifacts.sh",
  "scripts/prune-production-backups.py",
  "scripts/verify-release-source.mjs",
  "scripts/verify-release-version.mjs",
  "src/app/api/machete/squads/formula-adaptations/route.ts"
];

verifyReleaseVersion();

const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
if (status) {
  const changedPaths = status.split(/\r?\n/).map((line) => line.slice(3)).filter(Boolean);
  fail(`Release source is dirty. Commit or remove these paths first: ${changedPaths.join(", ")}`);
}

const trackedFiles = new Set(git(["ls-files"]).split(/\r?\n/).filter(Boolean));
const missingTrackedFiles = requiredTrackedFiles.filter((path) => !trackedFiles.has(path));
if (missingTrackedFiles.length > 0) {
  fail(`Required release files are not tracked: ${missingTrackedFiles.join(", ")}`);
}

const commit = git(["rev-parse", "HEAD"]);
const tree = git(["rev-parse", "HEAD^{tree}"]);
const branch = git(["branch", "--show-current"]) || "detached";
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

if (ciMode) {
  // Manual dispatch may package a different ref from the workflow's own SHA.
  // The caller freezes it once, validates it fully and supplies that same SHA here.
  try {
    assertReleaseRevision(expectedCommit ?? process.env.GITHUB_SHA?.trim(), commit);
  } catch (error) {
    fail(error.message);
  }
} else if (!allowUnpushed) {
  const remoteRefs = git([
    "for-each-ref",
    "--format=%(refname:short)",
    "--contains",
    commit,
    "refs/remotes/origin"
  ]).split(/\r?\n/).filter(Boolean);
  if (remoteRefs.length === 0) {
    fail(`HEAD ${commit} is not present on an origin remote ref. Push it before packaging production.`);
  }
}

process.stdout.write(`${JSON.stringify({
  status: "ok",
  version: packageVersion,
  commit,
  tree,
  branch,
  source: ciMode ? "github-actions" : allowUnpushed ? "local-unpushed-check" : "origin"
})}\n`);

function git(argumentsList) {
  try {
    return execFileSync("git", argumentsList, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    fail(stderr || `git ${argumentsList.join(" ")} failed.`);
  }
}

function verifyReleaseVersion() {
  try {
    execFileSync(process.execPath, ["scripts/verify-release-version.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    fail(stderr || "Release version contract verification failed.");
  }
}

function fail(message) {
  process.stderr.write(`[release:verify-source] ${message}\n`);
  process.exit(1);
}
