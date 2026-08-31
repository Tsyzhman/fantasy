import assert from "node:assert/strict";
import test from "node:test";

import {
  orderProgressiveFantasyPlayerPool,
  parseProgressiveFantasyPlayerPoolCursor,
  parseProgressiveFantasyPlayerPoolStage,
  progressiveFantasyPlayerPoolBatchSize,
  progressiveFantasyPlayerPoolPage
} from "./squad-player-pool-batches";

const players = [
  { playerId: "low", ownershipPercent: 2 },
  { playerId: "squad-1", ownershipPercent: 1 },
  { playerId: "unknown", ownershipPercent: null },
  { playerId: "popular", ownershipPercent: 57.28 },
  { playerId: "squad-2", ownershipPercent: 0 },
  { playerId: "medium", ownershipPercent: 18 }
];

test("progressive pool puts saved-squad players first, then Sports.ru popularity", () => {
  const ordered = orderProgressiveFantasyPlayerPool(players, ["squad-2", "squad-1", "squad-2"]);
  assert.deepEqual(ordered.map((player) => player.playerId), [
    "squad-2",
    "squad-1",
    "popular",
    "medium",
    "low",
    "unknown"
  ]);
  assert.equal(new Set(ordered.map((player) => player.playerId)).size, players.length);
});

test("base and detail stages each cover the ordered pool in real batches", () => {
  const ordered = orderProgressiveFantasyPlayerPool(players, ["squad-1"]);
  const first = progressiveFantasyPlayerPoolPage(ordered, 0, "BASE", 1, 2);
  const second = progressiveFantasyPlayerPoolPage(ordered, Number(first.pageInfo.nextCursor), "BASE", 1, 2);
  const third = progressiveFantasyPlayerPoolPage(ordered, Number(second.pageInfo.nextCursor), "BASE", 1, 2);
  const visible = [...first.players, ...second.players, ...third.players];
  const detailFirst = progressiveFantasyPlayerPoolPage(ordered, 0, "DETAILS", 1, 2);
  const detailSecond = progressiveFantasyPlayerPoolPage(ordered, Number(detailFirst.pageInfo.nextCursor), "DETAILS", 1, 2);
  const detailThird = progressiveFantasyPlayerPoolPage(ordered, Number(detailSecond.pageInfo.nextCursor), "DETAILS", 1, 2);
  const enriched = [...detailFirst.players, ...detailSecond.players, ...detailThird.players];

  assert.deepEqual(visible, ordered);
  assert.deepEqual(enriched, ordered);
  assert.equal(new Set(visible.map((player) => player.playerId)).size, players.length);
  assert.equal(first.pageInfo.visiblePlayers, 2);
  assert.equal(first.pageInfo.enrichedPlayers, 0);
  assert.equal(third.pageInfo.nextCursor, "0");
  assert.equal(third.pageInfo.nextStage, "DETAILS");
  assert.equal(third.pageInfo.complete, false);
  assert.equal(detailThird.pageInfo.nextCursor, null);
  assert.equal(detailThird.pageInfo.complete, true);
  assert.equal(detailThird.pageInfo.enrichedPlayers, players.length);
  assert.equal(third.pageInfo.totalPlayers, players.length);
  assert.equal(first.pageInfo.stage, "BASE");
  assert.equal(detailFirst.pageInfo.stage, "DETAILS");
});

test("progressive batch size is ten percent of the current league pool", () => {
  assert.equal(progressiveFantasyPlayerPoolBatchSize(806), 81);
  assert.equal(progressiveFantasyPlayerPoolBatchSize(661), 67);
  assert.equal(progressiveFantasyPlayerPoolBatchSize(10), 1);
  assert.equal(progressiveFantasyPlayerPoolBatchSize(0), 1);
});

test("progressive cursor parser rejects malformed and unsafe offsets", () => {
  assert.equal(parseProgressiveFantasyPlayerPoolCursor(null), 0);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("64"), 64);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("-1"), null);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("1.5"), null);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("9007199254740992"), null);
  assert.equal(parseProgressiveFantasyPlayerPoolStage(null), "BASE");
  assert.equal(parseProgressiveFantasyPlayerPoolStage("DETAILS"), "DETAILS");
  assert.equal(parseProgressiveFantasyPlayerPoolStage("UNKNOWN"), null);
});
