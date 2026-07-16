import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const allowedSuffixes = new Set([".test.ts", ".db-test.ts"]);
const suffix = process.argv[2];

if (!suffix || !allowedSuffixes.has(suffix)) {
  console.error(`Expected one test suffix: ${[...allowedSuffixes].join(" or ")}.`);
  process.exit(1);
}

function collectTestFiles(directory: string): string[] {
  const tests: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) tests.push(...collectTestFiles(path));
    else if (entry.isFile() && entry.name.endsWith(suffix)) tests.push(path);
  }

  return tests;
}

const tests = collectTestFiles("src").sort();
if (tests.length === 0) {
  console.error(`No test files ending in ${suffix} were found under src/.`);
  process.exit(1);
}

console.log(`Running ${tests.length} test file(s) ending in ${suffix}.`);

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const result = spawnSync(process.execPath, [tsxCli, "--test", ...tests], {
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
