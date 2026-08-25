#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const argumentsList = process.argv.slice(2);
let baseRef;

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument !== "--base") fail(`Unknown argument: ${argument}`);
  if (baseRef !== undefined) fail("--base may be provided only once.");
  baseRef = argumentsList[index + 1]?.trim();
  if (!baseRef) fail("--base requires a Git revision.");
  index += 1;
}

const packageManifest = jsonFile("package.json");
const packageLock = jsonFile("package-lock.json");
const changelog = textFile("CHANGELOG.md");
const currentVersion = stableVersion(packageManifest.version, "package.json");

if (packageLock.version !== currentVersion) {
  fail(`package-lock.json top-level version ${display(packageLock.version)} does not match ${currentVersion}.`);
}

if (packageLock.packages?.[""]?.version !== currentVersion) {
  fail(`package-lock.json root package version ${display(packageLock.packages?.[""]?.version)} does not match ${currentVersion}.`);
}

const headings = [...changelog.matchAll(/^##\s+(\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/gm)];
if (headings.length === 0) fail("CHANGELOG.md has no dated semantic-version release headings.");
if (headings[0][1] !== currentVersion) {
  fail(`CHANGELOG.md newest version ${headings[0][1]} does not match ${currentVersion}.`);
}
if (!validCalendarDate(headings[0][2])) {
  fail(`CHANGELOG.md release date ${headings[0][2]} is not a valid calendar date.`);
}

const duplicateHeading = headings.find((heading, index) =>
  headings.findIndex((candidate) => candidate[1] === heading[1]) !== index
);
if (duplicateHeading) fail(`CHANGELOG.md contains duplicate version ${duplicateHeading[1]}.`);

let baseVersion;
let changedPathCount = 0;

if (baseRef !== undefined) {
  const baseCommit = git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
  const changedPaths = git(["diff", "--name-only", "--diff-filter=ACDMRTUXB", baseCommit, "--"])
    .split(/\r?\n/)
    .filter(Boolean);
  changedPathCount = changedPaths.length;

  if (changedPaths.length > 0) {
    const baseManifest = jsonText(git(["show", `${baseCommit}:package.json`]), `${baseRef}:package.json`);
    baseVersion = stableVersion(baseManifest.version, `${baseRef}:package.json`);

    if (compareVersions(currentVersion, baseVersion) <= 0) {
      fail(`Version ${currentVersion} must be newer than base version ${baseVersion}.`);
    }

    const changedPathSet = new Set(changedPaths);
    for (const requiredPath of ["package.json", "package-lock.json", "CHANGELOG.md"]) {
      if (!changedPathSet.has(requiredPath)) {
        fail(`${requiredPath} must change with every versioned change set.`);
      }
    }
  }
}

process.stdout.write(`${JSON.stringify({
  status: "ok",
  version: currentVersion,
  releaseDate: headings[0][2],
  baseVersion: baseVersion ?? null,
  changedPathCount
})}\n`);

function stableVersion(value, source) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    fail(`${source} must contain a stable semantic version, received ${display(value)}.`);
  }
  return value;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function validCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function textFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function jsonFile(path) {
  return jsonText(textFile(path), path);
}

function jsonText(value, source) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`Cannot parse ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function git(argumentsToGit) {
  try {
    return execFileSync("git", argumentsToGit, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    fail(stderr || `git ${argumentsToGit.join(" ")} failed.`);
  }
}

function display(value) {
  return value === undefined ? "<missing>" : JSON.stringify(value);
}

function fail(message) {
  process.stderr.write(`[release:verify-version] ${message}\n`);
  process.exit(1);
}
