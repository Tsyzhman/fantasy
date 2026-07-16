import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const initialMigration = readFileSync(resolve("prisma/migrations/000001_init/migration.sql"), "utf8");
const betaTelemetryMigration = readFileSync(
  resolve("prisma/migrations/000006_beta_test_telemetry/migration.sql"),
  "utf8"
);
const betaEnvironmentMigration = readFileSync(
  resolve("prisma/migrations/000008_beta_test_moderated_environment/migration.sql"),
  "utf8"
);

test("beta telemetry foreign key targets the canonical Prisma user table", () => {
  assert.match(initialMigration, /CREATE TABLE "User" \(/);
  assert.match(betaTelemetryMigration, /REFERENCES "User"\("id"\)/);
  assert.doesNotMatch(betaTelemetryMigration, /REFERENCES "users"\("id"\)/);
});

test("beta moderator environment migration stores only the approved physical-device evidence values", () => {
  assert.match(betaEnvironmentMigration, /ADD COLUMN "moderated_environment" TEXT/);
  assert.match(betaEnvironmentMigration, /'IOS_SAFARI_PHYSICAL'/);
  assert.match(betaEnvironmentMigration, /'ANDROID_CHROME_PHYSICAL'/);
  assert.match(betaEnvironmentMigration, /beta_test_runs_moderated_environment_check/);
});
