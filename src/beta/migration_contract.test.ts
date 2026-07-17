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
const betaSubmissionMigration = readFileSync(
  resolve("prisma/migrations/000009_beta_test_submission/migration.sql"),
  "utf8"
);
const betaSubmissionContractMigration = readFileSync(
  resolve("prisma/migrations/000010_beta_test_submission_contract/migration.sql"),
  "utf8"
);
const clientCriticalErrorMigration = readFileSync(
  resolve("prisma/migrations/000011_client_critical_error_events/migration.sql"),
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

test("beta submission expand migration adds only a nullable provenance field", () => {
  assert.match(betaSubmissionMigration, /ADD COLUMN "submitted_at" TIMESTAMP\(3\)/);
  assert.doesNotMatch(betaSubmissionMigration, /UPDATE\s+"beta_test_runs"/i);
  assert.doesNotMatch(betaSubmissionMigration, /SET\s+"submitted_at"/i);
  assert.doesNotMatch(betaSubmissionMigration, /NOT NULL/i);
  assert.doesNotMatch(betaSubmissionMigration, /ADD CONSTRAINT/i);
});

test("beta submission contract rejects new real valid runs without inventing provenance", () => {
  assert.match(betaSubmissionContractMigration, /SET lock_timeout = '5s'/);
  assert.match(betaSubmissionContractMigration, /SET statement_timeout = '30s'/);
  assert.match(
    betaSubmissionContractMigration,
    /ADD CONSTRAINT "beta_test_runs_real_valid_requires_submission_check"/
  );
  assert.match(betaSubmissionContractMigration, /"synthetic" IS TRUE/);
  assert.match(betaSubmissionContractMigration, /"valid" IS DISTINCT FROM TRUE/);
  assert.match(betaSubmissionContractMigration, /"submitted_at" IS NOT NULL/);
  assert.match(betaSubmissionContractMigration, /\) NOT VALID/);
  assert.doesNotMatch(betaSubmissionContractMigration, /UPDATE\s+"beta_test_runs"/i);
  assert.doesNotMatch(betaSubmissionContractMigration, /SET\s+"submitted_at"/i);
  assert.doesNotMatch(betaSubmissionContractMigration, /VALIDATE CONSTRAINT/i);
  assert.doesNotMatch(
    betaSubmissionContractMigration,
    /ALTER\s+COLUMN\s+"?submitted_at"?\s+SET\s+NOT\s+NULL/i
  );
});

test("client critical-error storage contains only coarse aggregate fields", () => {
  assert.match(clientCriticalErrorMigration, /CREATE TABLE "client_critical_error_events"/);
  assert.match(clientCriticalErrorMigration, /"kind" TEXT NOT NULL/);
  assert.match(clientCriticalErrorMigration, /"route_group" TEXT NOT NULL/);
  assert.match(clientCriticalErrorMigration, /"occurred_minute" TIMESTAMP\(3\) NOT NULL/);
  assert.match(clientCriticalErrorMigration, /"count" INTEGER NOT NULL DEFAULT 1/);
  assert.match(clientCriticalErrorMigration, /client_critical_error_events_kind_check/);
  assert.match(clientCriticalErrorMigration, /client_critical_error_events_route_group_check/);
  assert.doesNotMatch(clientCriticalErrorMigration, /message|stack|query|user_id|session|ip_address|user_agent/i);
});
