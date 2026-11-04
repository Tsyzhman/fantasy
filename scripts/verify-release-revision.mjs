#!/usr/bin/env node
// @spec spec://common/INFRA-006-continuous-deployment#contracts
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertReleaseRevision(expected, actual) {
  if (typeof expected !== "string" || !/^[0-9a-f]{40}$/.test(expected)) {
    throw new Error("Expected release revision must be a full lowercase commit SHA.");
  }
  if (actual !== expected) {
    throw new Error(`Expected release commit ${expected} does not match HEAD ${actual}.`);
  }
  return actual;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Provide exactly one full expected commit SHA.");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assertReleaseRevision(process.argv[2], commit);
    process.stdout.write(`Validated exact release revision ${commit}\n`);
  } catch (error) {
    process.stderr.write(`[release:verify-revision] ${error.message}\n`);
    process.exitCode = 1;
  }
}
