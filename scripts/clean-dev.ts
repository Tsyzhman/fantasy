import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

/** @spec spec://common/INFRA-006-continuous-deployment#contracts */
const generatedPaths = [
  ".next",
  "next-env.d.ts",
  "tsconfig.tsbuildinfo",
  "coverage",
  "playwright-report",
  "test-results",
  "output/playwright-test-results"
];

const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
if (args.length > (dryRun ? 1 : 0)) {
  throw new Error("Usage: npm run clean:dev -- [--dry-run]");
}

const root = realpathSync(process.cwd());
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (manifest.name !== "fantasy-scout") {
  throw new Error("Run dev cleanup from the Fantasy Scout root.");
}

const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
const targets = generatedPaths.flatMap((name) => {
  const target = resolve(root, name);
  if (!existsSync(target)) return [];
  if (!target.startsWith(rootPrefix) || realpathSync(target) !== target) {
    throw new Error(`Refusing to remove a linked path or path outside the workspace: ${target}`);
  }
  return [{ name, target }];
});

if (!dryRun && [".next/lock", ".next/dev/lock"].some(name => existsSync(resolve(root, name)))) {
  throw new Error("Stop the local Next.js build or dev server before cleaning.");
}

for (const { name, target } of targets) {
  if (!dryRun) rmSync(target, { recursive: true, force: true });
  console.log(`${dryRun ? "Would remove" : "Removed"} ${name}`);
}

if (targets.length === 0) console.log("No generated dev files found.");
