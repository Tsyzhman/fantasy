import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseSquadFilterPresetFilters } from "./squad-filter-presets";

const validPreset = {
  version: 1,
  query: "Ivanov",
  teamName: "Baltika",
  position: "MID",
  minimumPrice: 6.5,
  maximumPrice: 12,
  horizon: 5,
  onlyAffordable: true,
  historyScope: "ALL_LOADED",
  advancedFilters: {
    player: { minimum: "", maximum: "", query: "ivan" },
    nextFp: { minimum: "5", maximum: "", query: "" },
    "stat:xg_per_90_l5": { minimum: "", maximum: "1", query: "" }
  }
};

test("squad filter presets retain every portable player-pool filter", () => {
  assert.deepEqual(parseSquadFilterPresetFilters(validPreset), validPreset);
});

test("squad filter presets reject malformed ranges, columns and scopes", () => {
  assert.equal(parseSquadFilterPresetFilters({ ...validPreset, minimumPrice: 14 }), null);
  assert.equal(parseSquadFilterPresetFilters({ ...validPreset, historyScope: "CURRENT_COMPETITION" }), null);
  assert.equal(parseSquadFilterPresetFilters({ ...validPreset, advancedFilters: { unsafe: { minimum: "", maximum: "", query: "x" } } }), null);
});

test("old squad presets discard retired forecast filters without resetting useful criteria", () => {
  assert.deepEqual(parseSquadFilterPresetFilters({
    ...validPreset,
    advancedFilters: {
      ...validPreset.advancedFilters,
      foPositionCalibratedFp: { minimum: "6", maximum: "", query: "" },
      altJointAcceptedFp: { minimum: "4", maximum: "", query: "" }
    }
  }), validPreset);
});

test("saved squad presets use the authenticated user and no league scope", () => {
  const route = readFileSync(new URL("../app/api/user/saved-views/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireApiUser/);
  assert.match(route, /where: \{ userId, source \}/);
  assert.doesNotMatch(route, /leagueId/);
  assert.match(route, /source === "squad"/);
});
