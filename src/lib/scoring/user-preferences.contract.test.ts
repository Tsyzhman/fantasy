import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const userPage = readFileSync(new URL("../../components/user-scoring-preferences-page.tsx", import.meta.url), "utf8");
const macheteRoute = readFileSync(new URL("../../app/machete/models/page.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../../components/model-settings-page.tsx", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../../app/admin/models/machete/page.tsx", import.meta.url), "utf8");

test("Machete user settings are account-scoped and never trigger global snapshot recalculation", () => {
  assert.match(userPage, /requireCurrentUser\(\)/);
  assert.match(userPage, /userId_modelSource: \{ userId: user\.id, modelSource: "MACHETE" \}/);
  assert.doesNotMatch(userPage, /recalculateMacheteSnapshots|customFormulaGk|customFormulaEnabled/);
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

/** @spec spec://common/PROP-002-editorial-sport-design#workspace-navigation */
test("global Machete model editing remains on an admin-only route", () => {
  assert.match(adminRoute, /ModelSettingsPage/);
  assert.match(adminPage, /await requireAdminUser\(\)/);
  assert.match(adminPage, /modelSource: "MACHETE"/);
  assert.match(adminPage, /formData\.get\("modelSource"\) !== "MACHETE"\) notFound\(\)/);
  assert.match(adminPage, /await recalculateMacheteSnapshots\(prisma\)/);
});
