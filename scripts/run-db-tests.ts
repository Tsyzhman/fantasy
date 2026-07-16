import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collectDatabaseTests(directory: string): string[] {
  const tests: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) tests.push(...collectDatabaseTests(path));
    else if (entry.isFile() && entry.name.endsWith(".db-test.ts")) tests.push(path);
  }

  return tests;
}

const tests = collectDatabaseTests("src").sort();
if (tests.length === 0) {
  console.error("No database integration tests were found under src/**/*.db-test.ts.");
  process.exit(1);
}

console.log(`Running ${tests.length} database integration test file(s).`);

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
