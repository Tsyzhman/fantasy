import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const initialMigration = readFileSync(resolve("prisma/migrations/000001_init/migration.sql"), "utf8");
const betaTelemetryMigration = readFileSync(
  resolve("prisma/migrations/000006_beta_test_telemetry/migration.sql"),
  "utf8"
);

test("beta telemetry foreign key targets the canonical Prisma user table", () => {
  assert.match(initialMigration, /CREATE TABLE "User" \(/);
  assert.match(betaTelemetryMigration, /REFERENCES "User"\("id"\)/);
  assert.doesNotMatch(betaTelemetryMigration, /REFERENCES "users"\("id"\)/);
});
