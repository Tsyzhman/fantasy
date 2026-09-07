import assert from "node:assert/strict";
import { test } from "node:test";
import { intervalPlanEp, projectJointStates } from "./forecast-model";
const score = { position: "G" as const, toiSeconds: 3600, result: "W60" as const, goals: 0, assists: 0, plusMinus: 0, pim: 0, saves: 21, goalsAgainst: 1, fullGame: true, teamShutout: false };
test("joint forecast applies participation once and retains odd saves", () => {
  const result = projectJointStates({ states: [{ probability: .25, participates: true, score }, { probability: .75, participates: false, score }], modelVersion: "test", rulesVersion: "test", asOf: 10, inputAvailableAt: [9], xgReady: false });
  assert.equal(result.ep, 3); assert.equal(result.appearanceProbability, .25);
  assert.equal(result.variance, 27); assert.equal(Object.values(result.breakdown).reduce((n, v) => n + v, 0), 3);
  assert.equal(projectJointStates({ states: [{ probability: 1, participates: true, score }], modelVersion: "test", rulesVersion: "test", asOf: 10, inputAvailableAt: [11], xgReady: true }).ep, null);
});
test("ownership intervals lose sold games and never acquire games already played", () => {
  const result = intervalPlanEp({ owned: ["a"], steps: [{ out: "a", in: "b", at: 20 }, { out: "b", in: "a", at: 40 }], games: [
    { playerId: "a", matchId: "1", startsAt: 15, ep: 3, status: "SCHEDULED" },
    { playerId: "a", matchId: "2", startsAt: 30, ep: 5, status: "SCHEDULED" },
    { playerId: "b", matchId: "1", startsAt: 15, ep: 100, status: "SCHEDULED" },
    { playerId: "b", matchId: "2", startsAt: 30, ep: 8, status: "SCHEDULED" },
    { playerId: "a", matchId: "3", startsAt: 45, ep: 2, status: "SCHEDULED" }
  ], asOf: 10, horizonEnd: 50 });
  assert.deepEqual(result, { baseline: 10, planned: 13, gain: 3, reason: null });
});
