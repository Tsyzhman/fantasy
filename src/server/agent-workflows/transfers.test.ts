/** @spec spec://modules/agents/FEAT-017-squad-workflows#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@/lib/api-handler";
import { createFantasySquadRoundPlans, defaultFantasySquadRules, type FantasyPlannerPlayer } from "@/machete/squad_logic";
import { readSteps } from "./definition";
import { previewTransfers, proposeTransfers, type PlanningContext } from "./transfers";

function sample(): PlanningContext {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "MID", "FWD",
    "DEF", "DEF", "MID", "MID", "FWD"] as const;
  const pool = roles.map((position, index): FantasyPlannerPlayer => {
    const id = String(index + 1);
    return { id, playerId: id, position, positionGroup: position, teamId: id, teamName: "T" + id, name: "P" + id, leagueName: "Fixture",
      price: 5, priceSource: "SPORTS_RU", valueScore: 1, predictedFp: 3, roundPoints: [3, 3, 3], fixtures: [], fixtureDifficulties: [] };
  });
  const selections = pool.slice(0, 15).map((player, slotIndex) => ({ playerId: player.playerId, slotIndex,
    isLocked: false, isStarter: slotIndex < 11, isCaptain: slotIndex === 0, isViceCaptain: slotIndex === 1, purchasePrice: 1 }));
  return { pool, rules: defaultFantasySquadRules, roundPlans: createFantasySquadRoundPlans(selections), roundIds: ["round:1"],
    contestUpdatedAt: new Date(0), forecastBlocked: false, storedBaseline: selections.map(player => player.playerId), openingAvailable: 3 };
}
const firstMove = { outPlayerId: "2", inPlayerId: "16" };

test("typed workflow graph rejects extra data, invalid dependencies, versions of actions and more than two transfers", () => {
  for (const candidate of [
    [], [{ action: "unknown" }], [{ action: "squads_save" }], [{ action: "squads_preview" }],
    [{ action: "squads_get" }, { action: "squads_get" }], [{ action: "squads_propose", maxTransfers: 3 }],
    [{ action: "squads_propose", horizon: "1" }], [{ action: "squads_get", userId: "other" }],
    [{ action: "squads_preview", moves: [{ ...firstMove, price: 0.1 }] }],
    [{ action: "squads_preview", moves: [firstMove, firstMove, firstMove] }]
  ]) {
    assert.throws(() => readSteps(candidate), (error: unknown) => error instanceof ApiError && error.code === "INVALID_ARGUMENTS");
  }
  const steps = [{ action: "squads_preview", moves: [firstMove] }, { action: "squads_save" }];
  assert.deepEqual(readSteps(steps), steps);
});

test("locked, duplicate, wrong position, inactive, budget and club violations have explicit reasons", () => {
  const context = sample();
  function reject(inPlayerId: string) { return previewTransfers(context, [{ outPlayerId: "2", inPlayerId }], 1).preview.reasons[0]; }
  assert.equal(reject("3").code, "DUPLICATE_PLAYER");
  assert.equal(reject("999").code, "PLAYER_UNAVAILABLE");
  assert.equal(reject("18").code, "POSITION_MISMATCH");
  context.roundPlans[0].selections[1].isLocked = true;
  assert.equal(reject("16").code, "PLAYER_LOCKED");
  context.roundPlans[0].selections[1].isLocked = false;
  context.pool[15].price = 90;
  assert.match(reject("16").message, /Budget exceeded/);
  context.pool[15].price = 5;
  context.pool[0].teamId = context.pool[2].teamId = context.pool[15].teamId = "club";
  assert.match(reject("16").message, /limit exceeded/);
});

test("opening Sports baseline and an independent future draft both limit a transfer", () => {
  const context = sample();
  context.storedBaseline = context.storedBaseline!.map((id, i) => i >= 12 ? String(100 + i) : id);
  const opening = previewTransfers(context, [firstMove], 1);
  assert.equal(opening.preview.reasons[0].code, "TRANSFER_LIMIT");
  assert.match(opening.preview.reasons[0].message, /Round \+0: 4 transfers planned; 3 available/);
  context.storedBaseline = null;
  const future = context.roundPlans[1];
  future.linkedToPrevious = false;
  for (const [index, id] of [[2, 17], [5, 18], [9, 20]]) future.selections[index].playerId = String(id);
  const blocked = previewTransfers(context, [firstMove], 1);
  assert.equal(blocked.preview.reasons[0].code, "TRANSFER_LIMIT");
  assert.match(blocked.preview.reasons[0].message, /Round \+1: 4 transfers planned; 3 available/);
});

test("linked rounds inherit canonical prices and player roles, other rounds and the input remain intact", () => {
  const context = sample();
  context.roundPlans[2].linkedToPrevious = false;
  const original = structuredClone(context.roundPlans);
  const result = previewTransfers(context, [firstMove], 3);
  assert.ok(result.plans);
  assert.equal(result.plans[0].selections[1].purchasePrice, 5);
  assert.equal(result.plans[0].selections[1].isViceCaptain, true);
  assert.deepEqual(result.plans[1].selections, result.plans[0].selections);
  assert.deepEqual(result.plans.slice(2), original.slice(2));
  assert.deepEqual(context.roundPlans, original);
});

test("missing authoritative points and planner readiness are visible in forecast results", () => {
  const context = sample();
  context.forecastBlocked = true;
  assert.equal(proposeTransfers(context, 2, 1).preview.reasons[0].code, "FORECAST_UNAVAILABLE");
  context.forecastBlocked = false;
  context.pool[0].roundPoints = [];
  context.pool[0].predictedFp = null;
  assert.equal(proposeTransfers(context, 2, 1).preview.before.projectedNext, null);
  assert.equal(previewTransfers(context, [firstMove], 1).preview.delta?.projectedNext, null);
});

test("ranking with one remaining free transfer returns a legal single even when two moves gain more points", () => {
  const context = sample();
  context.rules = { ...context.rules, transferLimitPerRound: 1, maxBankedTransfers: 1 };
  context.openingAvailable = 1;
  for (const player of context.pool.slice(15)) { player.predictedFp = 10; player.roundPoints = [10, 10, 10]; }
  const proposal = proposeTransfers(context, 2, 1);
  assert.equal(proposal.preview.accepted, true, JSON.stringify(proposal.preview.reasons));
  assert.equal(proposal.preview.moves.length, 1);
  assert.deepEqual(proposal.preview.transfersByRound[0], { used: 1, available: 1 });
});
