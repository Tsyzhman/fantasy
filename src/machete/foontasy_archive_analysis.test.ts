import assert from "node:assert/strict";
import test from "node:test";

import { analyzeFoontasyArchive } from "@/machete/foontasy_archive_analysis";
import { firstFixturePoints } from "@/machete/foontasy_forecasts";

test("Foontasy archive waits for five distinct rounds before proposing a replacement formula", () => {
  const result = analyzeFoontasyArchive([
    { roundNumber: 1, position: "2", foontasyPoints: 5, modelNextPoints: 4 },
    { roundNumber: 2, position: "2", foontasyPoints: 7, modelNextPoints: 5 },
    { roundNumber: 3, position: "2", foontasyPoints: 9, modelNextPoints: 6 },
    { roundNumber: 4, position: "2", foontasyPoints: 11, modelNextPoints: 7 }
  ]);
  assert.equal(result.ready, false);
  assert.equal(result.proposedFormula, null);
  assert.equal(result.crossValidated, null);
});

test("Foontasy archive proposes a round-held-out calibration after five rounds", () => {
  const samples = Array.from({ length: 5 }, (_, roundIndex) =>
    Array.from({ length: 12 }, (_, playerIndex) => {
      const modelNextPoints = 1 + playerIndex / 2 + roundIndex / 10;
      return {
        roundNumber: roundIndex + 1,
        position: "2",
        modelNextPoints,
        foontasyPoints: 2 + 1.5 * modelNextPoints
      };
    })
  ).flat();
  const result = analyzeFoontasyArchive(samples);
  assert.equal(result.ready, true);
  assert.equal(result.rounds.length, 5);
  assert.equal(result.proposedFormula?.intercept, 2);
  assert.equal(result.proposedFormula?.modelNextPointsWeight, 1.5);
  assert.equal(result.crossValidated?.mae, 0);
  assert.equal(result.byPosition["2"].samples, 60);
});

test("first fixture points are extracted only from a valid model breakdown", () => {
  assert.equal(firstFixturePoints([{ points: 6.25 }, { points: 5 }]), 6.25);
  assert.equal(firstFixturePoints([{ points: "6.25" }]), null);
  assert.equal(firstFixturePoints(null), null);
});
