import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../prisma/migrations/000013_user_scoring_preferences/migration.sql", import.meta.url),
  "utf8"
);

test("user scoring preferences are source-keyed, user-owned, and cascade on account deletion", () => {
  assert.match(migration, /CREATE TABLE "UserScoringPreference"/);
  assert.match(migration, /UNIQUE INDEX "UserScoringPreference_userId_modelSource_key"/);
  assert.match(migration, /CHECK \("modelSource" IN \('WYSCOUT', 'MACHETE'\)\)/);
  assert.match(migration, /REFERENCES "User"\("id"\) ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /customFormula|Expected/i);
});
