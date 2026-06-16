import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

if (!shadowDatabaseUrl) {
  console.error("SHADOW_DATABASE_URL is required for Prisma migration drift checks.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadowDatabaseUrl,
    "--exit-code"
  ],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
