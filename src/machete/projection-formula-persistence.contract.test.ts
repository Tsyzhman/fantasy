import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../prisma/migrations/000016_projection_formula_configs/migration.sql", import.meta.url),
  "utf8"
);
const adminPage = readFileSync(new URL("../components/model-settings-page.tsx", import.meta.url), "utf8");
const userPage = readFileSync(new URL("../components/user-scoring-preferences-page.tsx", import.meta.url), "utf8");

test("Expected and personal Alt pipelines have separate JSON persistence", () => {
  assert.match(schema, /projectionFormulaConfig\s+Json\?/);
  assert.match(schema, /alternativeProjectionFormulaConfig\s+Json\?/);
  assert.match(migration, /ADD COLUMN "projectionFormulaConfig" JSONB/);
  assert.match(migration, /ADD COLUMN "alternativeProjectionFormulaConfig" JSONB/);
  assert.match(adminPage, /projectionFormulaConfig: projectionConfigResult!\.config/);
  assert.match(userPage, /alternativeProjectionFormulaConfig: parsed\.config/);
});

test("both web editors post the complete staged formula configuration", () => {
  assert.match(adminPage, /ProjectionFormulaEditor config=\{expectedProjectionConfig\} prefix="projection"/);
  assert.match(userPage, /ProjectionFormulaEditor config=\{projectionConfig\} prefix="alternativeProjection"/);
});
