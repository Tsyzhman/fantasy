import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const workspaceRoot = resolve(process.cwd());
const standaloneRoot = resolve(workspaceRoot, ".next", "standalone");
const expectedPrefix = `${resolve(workspaceRoot, ".next")}${sep}`;

if (!standaloneRoot.startsWith(expectedPrefix)) {
  throw new Error(`Refusing to sanitize a standalone path outside .next: ${standaloneRoot}`);
}

if (!existsSync(standaloneRoot)) {
  console.log("No standalone output to sanitize.");
  process.exit(0);
}

const standalonePrefix = `${standaloneRoot}${sep}`;
const removed: Array<{ path: string; bytes: number }> = [];
const localOnlyPaths = [
  ".codex-tmp",
  ".codex_sheet_work",
  ".git",
  ".playwright-cli",
  ".postgres-data",
  "output",
  "outputs",
  "playwright-report",
  "test-results",
  "tsconfig.tsbuildinfo",
  join(".next", "cache"),
  join(".next", "dev"),
  join(".next", "standalone")
];

for (const relativePath of localOnlyPaths) removeLocalOnlyPath(relativePath);
for (const entry of readdirSync(standaloneRoot)) {
  if (entry === ".env" || entry.startsWith(".env.")) removeLocalOnlyPath(entry);
}

const removedBytes = removed.reduce((sum, item) => sum + item.bytes, 0);
if (removed.length === 0) {
  console.log("Standalone output contains no local state or generated QA artifacts.");
} else {
  console.log(`Sanitized ${removed.length} standalone artifact${removed.length === 1 ? "" : "s"} (${formatBytes(removedBytes)}):`);
  for (const item of removed) console.log(`- ${item.path}`);
}

function removeLocalOnlyPath(relativePath: string) {
  const target = resolve(standaloneRoot, relativePath);
  if (target !== standaloneRoot && !target.startsWith(standalonePrefix)) {
    throw new Error(`Refusing to remove a path outside standalone output: ${target}`);
  }
  if (!existsSync(target)) return;
  const bytes = sizeOf(target);
  rmSync(target, { recursive: true, force: true });
  removed.push({ path: relativePath, bytes });
}

function sizeOf(target: string): number {
  const stats = lstatSync(target);
  if (!stats.isDirectory()) return stats.size;
  return readdirSync(target).reduce((sum, entry) => sum + sizeOf(resolve(target, entry)), 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}
