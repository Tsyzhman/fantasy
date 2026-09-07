#!/usr/bin/env node
/* global process */

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? process.cwd());
const sha256 = (value) => createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
const normalized = (value) => value.split(sep).join("/");

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function text(path) {
  return (await readFile(resolve(root, path), "utf8")).replace(/\r\n/g, "\n");
}

async function files(directory) {
  const absolute = resolve(root, directory);
  if (!await exists(absolute)) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = resolve(absolute, entry.name);
    return entry.isDirectory() ? files(normalized(relative(root, child))) : [normalized(relative(root, child))];
  }));
  return nested.flat().sort();
}

const checks = [];
const errors = [];
const pass = (id, detail) => checks.push({ id, status: "passed", detail });
const fail = (id, detail) => { checks.push({ id, status: "failed", detail }); errors.push(detail); };

const connected = await exists(resolve(root, ".prist/connection.json"));
const managedEntrypoint = await exists(resolve(root, "AGENTS.md")) && (await text("AGENTS.md")).includes("<!-- prist:begin -->");
const managed = connected || managedEntrypoint || await exists(resolve(root, ".prist/workflow.json"));
const required = managed ? ["AGENTS.md"] : [
  "AGENTS.md",
  "specs/protocols/BOOT.md",
  "specs/SPEC-MAP.md",
  "specs/common/main.md",
  "specs/common/structure.md",
];
for (const path of required) {
  if (await exists(resolve(root, path))) pass(`required:${path}`, "present");
  else fail(`required:${path}`, `${path} is missing`);
}

const codexRoot = ".agents/skills/spec-driven-work";
const claudeRoot = ".claude/skills/spec-driven-work";
const codexFiles = (await files(codexRoot)).map((path) => path.slice(codexRoot.length + 1));
const claudeFiles = (await files(claudeRoot)).map((path) => path.slice(claudeRoot.length + 1));
if (JSON.stringify(codexFiles) !== JSON.stringify(claudeFiles)) {
  fail("skill:file-parity", "Codex and Claude skill file sets differ");
} else {
  pass("skill:file-parity", `${codexFiles.length} files`);
  for (const path of codexFiles) {
    const codex = await text(`${codexRoot}/${path}`);
    const claude = await text(`${claudeRoot}/${path}`);
    if (sha256(codex) !== sha256(claude)) fail(`skill:hash:${path}`, `${path} differs between clients`);
  }
}

if (await exists(resolve(root, "CLAUDE.md"))) {
  const claudeEntrypoint = await text("CLAUDE.md");
  if (claudeEntrypoint.includes("@AGENTS.md")) pass("entrypoint:claude-import", "CLAUDE.md imports AGENTS.md");
  else fail("entrypoint:claude-import", "CLAUDE.md must import @AGENTS.md");
}

if (await exists(resolve(root, "specs/BOARD.md"))) {
  const board = (await text("specs/BOARD.md")).replace(/<!--[\s\S]*?-->/g, "");
  const ids = [...board.matchAll(/\[WI-(\d+)\]\(([^)]+)\)/g)].map((match) => ({ id: `WI-${match[1]}`, path: match[2] }));
  const duplicates = ids.filter((item, index) => ids.findIndex((other) => other.id === item.id) !== index);
  if (duplicates.length) fail("board:unique", `Duplicate BOARD work IDs: ${[...new Set(duplicates.map((item) => item.id))].join(", ")}`);
  else pass("board:unique", `${ids.length} work items`);
  for (const item of ids) {
    const target = normalized(resolve(root, "specs", item.path));
    if (!target.startsWith(`${normalized(root)}/`) || !await exists(target)) fail(`board:link:${item.id}`, `${item.id} points to missing or unsafe ${item.path}`);
  }
}

if (managed) {
  if (!await exists(resolve(root, ".prist/workflow.json"))) {
    fail("state:connection-kit", ".prist/workflow.json is required for a connected repository");
  } else {
    try {
      const state = JSON.parse(await text(".prist/workflow.json"));
      const connection = connected ? JSON.parse(await text(".prist/connection.json")) : undefined;
      const expected = connection?.workflow ?? { bundleVersion: state.bundleVersion, stateSource: state.stateSource };
      const supportedStateShape = state.schemaVersion === undefined || state.schemaVersion === "4";
      const matches = supportedStateShape
        && state.status === "connection_ready"
        && state.bundleVersion === expected?.bundleVersion
        && state.stateSource === expected?.stateSource
        && Array.isArray(state.files)
        && state.files.length > 0;
      if (matches) pass("state:connection-kit", `${state.bundleVersion} ${state.stateSource}`);
      else fail("state:connection-kit", ".prist/workflow.json does not match the active setup context");
    } catch {
      fail("state:connection-kit", ".prist workflow or connection state contains invalid JSON");
    }
  }

  const hasSpecSpace = await exists(resolve(root, "specs/SPEC-MAP.md"))
    || await exists(resolve(root, "specs/common/main.md"))
    || (await files("specs/common")).some((path) => /\/(?:PROP|FEAT|INFRA)-\d+.*\.md$/.test(`/${path}`))
    || (await files("specs/modules")).some((path) => /\/(?:PROP|FEAT|INFRA)-\d+.*\.md$/.test(`/${path}`));
  if (!hasSpecSpace) {
    pass("spec-space:empty", "ready for first authored spec-space");
  } else {
    try {
      const script = resolve(dirname(fileURLToPath(import.meta.url)), "sync-spec-space.mjs");
      const { buildSnapshot } = await import(pathToFileURL(script).href);
      const snapshot = await buildSnapshot(root);
      if (snapshot.status === "current") pass("spec-space:current", `${snapshot.specs.length} typed specs`);
      else fail("spec-space:current", `Spec snapshot partial: ${snapshot.diagnostics.join("; ")}`);
    } catch (error) {
      fail("spec-space:current", `Spec snapshot check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const result = {
  schemaVersion: "1",
  repository: root,
  status: errors.length ? "failed" : "passed",
  checks,
  errors,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
