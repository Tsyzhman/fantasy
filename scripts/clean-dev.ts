import { readdirSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(process.cwd());
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
const removed: string[] = [];

for (const name of readdirSync(root)) {
  if (!shouldRemove(name)) continue;

  const target = resolve(root, name);
  if (!target.startsWith(rootPrefix)) {
    throw new Error(`Refusing to remove path outside workspace: ${target}`);
  }

  rmSync(target, { recursive: true, force: true });
  removed.push(name);
}

if (removed.length === 0) {
  console.log("No dev artifacts found.");
} else {
  console.log(`Removed ${removed.length} dev artifact${removed.length === 1 ? "" : "s"}:`);
  for (const name of removed) console.log(`- ${name}`);
}

function shouldRemove(name: string) {
  return (
    name === ".next" ||
    name === "tsconfig.tsbuildinfo" ||
    name.startsWith("tmp_") ||
    /^sports_ru_.*_backup_.*\.json$/.test(name)
  );
}
