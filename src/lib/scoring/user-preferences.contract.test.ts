import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const userPage = readFileSync(new URL("../../components/user-scoring-preferences-page.tsx", import.meta.url), "utf8");
const macheteRoute = readFileSync(new URL("../../app/machete/models/page.tsx", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../../app/admin/models/machete/page.tsx", import.meta.url), "utf8");

test("Machete user settings are account-scoped and never trigger global snapshot recalculation", () => {
  assert.match(userPage, /requireCurrentUser\(\)/);
  assert.match(userPage, /userId_modelSource: \{ userId: user\.id, modelSource: "MACHETE" \}/);
  assert.doesNotMatch(userPage, /recalculateSnapshotsForSource|customFormulaGk|customFormulaEnabled/);
  assert.doesNotMatch(userPage, /scoringFormulaFields|My Actual FP override/);
  assert.match(userPage, /scoringFormulaEnabled: false/);
  assert.match(userPage, /ProjectionFormulaEditor/);
  assert.match(userPage, /friendAltProjectionFormulaConfig/);
  assert.match(userPage, /projectionFormulaConfigFromFormData/);
  assert.match(userPage, /alternativeProjectionFormulaConfig: parsed\.config/);
  assert.match(userPage, /prefix="alternativeProjection"/);
  assert.doesNotMatch(userPage, /getActiveScoringModelForSource/);
  assert.match(userPage, /shared adapted Alt method/);
  assert.match(macheteRoute, /UserScoringPreferencesPage/);
});

test("global Machete model editing remains on an admin-only route", () => {
  assert.match(adminRoute, /ModelSettingsPage/);
  assert.match(adminRoute, /source: "MACHETE"/);
});
