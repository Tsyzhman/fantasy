#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const argumentsSet = new Set(process.argv.slice(2));
const supportedArguments = new Set(["--allow-unpushed", "--ci"]);
const unknownArguments = [...argumentsSet].filter((argument) => !supportedArguments.has(argument));

if (unknownArguments.length > 0) {
  fail(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const allowUnpushed = argumentsSet.has("--allow-unpushed");
const ciMode = argumentsSet.has("--ci");
const requiredTrackedFiles = [
  ".github/workflows/deploy-production.yml",
  "Dockerfile",
  "scripts/deploy-production-docker.sh",
  "scripts/export-formula-adaptation-models.py",
  "scripts/fpl-vpn-relay.mjs",
  "scripts/prune-production-artifacts.sh",
  "scripts/verify-release-source.mjs",
  "src/app/api/machete/squads/formula-adaptations/route.ts",
  "src/components/machete/FormulaAdaptationHoverCard.tsx",
  "src/machete/formula-adaptation-models.generated.json",
  "src/machete/formula_adaptations.ts"
];

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

const model = JSON.parse(readFileSync("src/machete/formula-adaptation-models.generated.json", "utf8"));
if (model?.schemaVersion !== 1 || model?.weatherIncluded !== false || !model?.models) {
  fail("Formula adaptation model artifact failed its release integrity check.");
}

const commit = git(["rev-parse", "HEAD"]);
const tree = git(["rev-parse", "HEAD^{tree}"]);
const branch = git(["branch", "--show-current"]) || "detached";
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

if (ciMode) {
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha && githubSha !== commit) {
    fail(`GitHub checkout SHA ${githubSha} does not match HEAD ${commit}.`);
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

function fail(message) {
  process.stderr.write(`[release:verify-source] ${message}\n`);
  process.exit(1);
}
