import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseMachetePlayerFilterPresetValue, parseMachetePlayerTableSettings } from "./machete-player-table-preferences";

test("player table settings retain ordered columns and clamp per-user widths", () => {
  assert.deepEqual(parseMachetePlayerTableSettings({
    version: 3,
    columns: ["goals", "raw:expected_goals", "goals"],
    widths: { player: 10, goals: 900, "raw:expected_goals": 101.4 },
    horizon: 10
  }), {
    version: 3,
    columns: ["goals", "raw:expected_goals"],
    widths: { player: 44, goals: 640, "raw:expected_goals": 101 },
    horizon: 10
  });
  assert.equal(parseMachetePlayerTableSettings({ version: 1, columns: ["unsafe"], widths: {} }), null);
  assert.deepEqual(parseMachetePlayerTableSettings({ version: 1, columns: ["goals"], widths: {} }), {
    version: 3,
    columns: ["predictedFp", "predictedFpPerPrice", "forecastHorizonFp", "foontasy", "foontasyPerPrice", "alternativePredictedFp", "alternativePredictedFpPerPrice", "alternativeForecastHorizon", "foPositionCalibratedFp", "altPositionCalibratedFp", "altJointAllFp", "foJointAllFp", "altJointAcceptedFp", "foJointAcceptedFp", "fixtures", "goals"],
    widths: {},
    horizon: 5
  });
  assert.deepEqual(parseMachetePlayerTableSettings({
    version: 2,
    columns: ["predictedFp", "alternativeForecastHorizon", "fixtures"],
    widths: {},
    horizon: 5
  })?.columns, [
    "predictedFp",
    "alternativeForecastHorizon",
    "foPositionCalibratedFp",
    "altPositionCalibratedFp",
    "altJointAllFp",
    "foJointAllFp",
    "altJointAcceptedFp",
    "foJointAcceptedFp",
    "fixtures"
  ]);
});

test("advanced player-table presets validate every field and reject unsafe keys", () => {
  assert.deepEqual(parseMachetePlayerFilterPresetValue({
    version: 1,
    filters: {
      goals: { min: "2", max: "8", query: "" },
      team: { min: "", max: "", query: "Балтика" }
    }
  }), {
    version: 1,
    filters: {
      goals: { min: "2", max: "8", query: "" },
      team: { min: "", max: "", query: "Балтика" }
    }
  });
  assert.equal(parseMachetePlayerFilterPresetValue({ version: 1, filters: { unsafe: { min: "", max: "", query: "x" } } }), null);
});

test("player table persistence uses isolated authenticated saved-view sources", () => {
  const apiSource = readFileSync(new URL("../app/api/user/saved-views/route.ts", import.meta.url), "utf8");
  const tableSource = readFileSync(new URL("../components/machete/MachetePlayerTable.tsx", import.meta.url), "utf8");
  assert.match(apiSource, /machetePlayerTableSettingsSource/);
  assert.match(apiSource, /machetePlayerTableFiltersSource/);
  assert.match(apiSource, /source === "squad"/);
  assert.match(tableSource, /loadPlayerTableSavedViews\(machetePlayerTableSettingsSource/);
  assert.match(tableSource, /savePlayerTableSettings/);
  assert.match(tableSource, /savePlayerTableFilterPreset/);
  assert.match(tableSource, /deletePlayerTableFilterPreset/);
});
