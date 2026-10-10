import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { loadFantasyPlayerPoolSnapshotPlayers } from "./fantasy-player-pool-snapshots";
import { parseMachetePlayerFilterPresetValue, parseMachetePlayerTableSettings } from "./machete-player-table-preferences";
import { retiredFantasyForecastKeys, withoutRetiredFantasyForecasts } from "./retired-fantasy-forecasts";
import { toFantasyPlayerPoolListItem } from "./squad-player-dto";
import type { FantasyPlannerPlayer } from "./squad_logic";

const preserved = {
  playerId: "7", predictedFp: 5.3, alternativePredictedFp: 0,
  foontasyPoints: null, roundPoints: [5.3, 6], alternativeRoundPoints: [0, 5.8]
};
const legacy = { ...preserved, ...Object.fromEntries(retiredFantasyForecastKeys.map((key) => [key, 42])) };

test("old snapshot fields are discarded without mutating FFO, FO, ALT or the original row", () => {
  assert.deepEqual(withoutRetiredFantasyForecasts(legacy), preserved);
  assert.equal(Object.hasOwn(legacy, "foJointAllFp"), true);
  assert.strictEqual(withoutRetiredFantasyForecasts(preserved), preserved, "new rows must not create another copy");
  const dto = toFantasyPlayerPoolListItem(legacy as unknown as FantasyPlannerPlayer);
  for (const key of retiredFantasyForecastKeys) assert.equal(Object.hasOwn(dto, key), false);
  assert.equal(dto.alternativePredictedFp, 0, "non-starters must retain a real zero ALT");
  assert.equal(dto.foontasyPoints, null, "missing FFO must not become zero");
  assert.deepEqual(dto.roundPoints, preserved.roundPoints);
});

test("snapshot batches read older revisions without returning retired fields or duplicate players", async () => {
  const prisma = {
    fantasyPlayerPoolSnapshot: { findFirst: async () => ({ id: "old-revision" }) },
    fantasyPlayerPoolSnapshotPlayer: {
      findMany: async () => [
        { playerId: "7", payload: legacy },
        { playerId: "8", payload: { playerId: "wrong-id", foJointAllFp: 8 } }
      ]
    }
  } as unknown as PrismaClient;
  const result = await loadFantasyPlayerPoolSnapshotPlayers(prisma, {
    contestId: "championship", snapshotId: "old-revision", playerIds: ["7", "7", "8"]
  });
  assert.deepEqual(result.players, [preserved]);
  assert.equal(Object.hasOwn(legacy, "foJointAllFp"), true);
});

test("all player-table preference versions lose only retired columns and their widths", () => {
  for (const version of [1, 2, 3]) {
    const settings = parseMachetePlayerTableSettings({
      version, horizon: 10,
      columns: ["foontasy", ...retiredFantasyForecastKeys, "predictedFp", "alternativePredictedFp", "raw:xg"],
      widths: { foontasy: 100, "raw:xg": 60, ...Object.fromEntries(retiredFantasyForecastKeys.map((key) => [key, 120])) }
    });
    assert.ok(settings);
    for (const key of retiredFantasyForecastKeys) {
      assert.equal(settings.columns.includes(key), false);
      assert.equal(Object.hasOwn(settings.widths, key), false);
    }
    assert.equal(settings.horizon, 10);
    assert.deepEqual(settings.widths, { foontasy: 100, "raw:xg": 60 });
    if (version !== 1) assert.deepEqual(settings.columns, ["foontasy", "predictedFp", "alternativePredictedFp", "raw:xg"]);
  }
});

test("saved player filters keep the surviving criteria when retired criteria are present", () => {
  const kept = { predictedFp: { min: "5", max: "", query: "" } };
  assert.deepEqual(parseMachetePlayerFilterPresetValue({
    version: 1,
    filters: { ...kept, ...Object.fromEntries(retiredFantasyForecastKeys.map((key) => [key, { min: "9", max: "", query: "" }])) }
  }), { version: 1, filters: kept });
});

test("planner and shared history no longer load adaptation models, features, shots or breakdown caches", () => {
  const planner = ["squad_planner.ts", "squad-team-strength.ts", "squad-projection.ts"]
    .map(file => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  const history = readFileSync(new URL("./shared_read_model.ts", import.meta.url), "utf8");
  assert.doesNotMatch(planner, /formula_adaptations|FormulaAdaptation|formulaAdaptation/);
  assert.doesNotMatch(history, /formula_adaptations|FormulaAdaptation|formulaAdaptation/);
  const start = planner.indexOf("async function loadTeamStrengthMatches(");
  const end = planner.indexOf("export function fillTeamStrengthStatsFromScore(", start);
  assert.ok(start >= 0 && end > start);
  const teamQuery = planner.slice(start, end);
  assert.doesNotMatch(teamQuery, /shots:|normalizedY|possession:|passes:|passAccuracy:/);
  for (const input of ["xg: true", "goals: true", "matchDate: true", "isHome: true", "opponentTeamId: true"]) {
    assert.ok(teamQuery.includes(input), `FO/ALT team-strength input must remain: ${input}`);
  }
  assert.match(planner, /withoutRetiredFantasyForecasts\(player\)/, "SSR saved-squad rows also normalize old snapshots");
});
