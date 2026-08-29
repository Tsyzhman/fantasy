import assert from "node:assert/strict";
import test from "node:test";

import {
  orderProgressiveFantasyPlayerPool,
  parseProgressiveFantasyPlayerPoolCursor,
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

test("progressive pool puts the active squad first, then Sports.ru popularity", () => {
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

test("progressive pages cover the ordered pool exactly once", () => {
  const ordered = orderProgressiveFantasyPlayerPool(players, ["squad-1"]);
  const first = progressiveFantasyPlayerPoolPage(ordered, 0, 2);
  const second = progressiveFantasyPlayerPoolPage(ordered, Number(first.pageInfo.nextCursor), 2);
  const third = progressiveFantasyPlayerPoolPage(ordered, Number(second.pageInfo.nextCursor), 2);
  const loaded = [...first.players, ...second.players, ...third.players];

  assert.deepEqual(loaded, ordered);
  assert.equal(new Set(loaded.map((player) => player.playerId)).size, players.length);
  assert.equal(first.pageInfo.loadedPlayers, 2);
  assert.equal(third.pageInfo.nextCursor, null);
  assert.equal(third.pageInfo.complete, true);
  assert.equal(third.pageInfo.totalPlayers, players.length);
  assert.equal(first.pageInfo.phase, "POOL");
});

test("progressive cursor parser rejects malformed and unsafe offsets", () => {
  assert.equal(parseProgressiveFantasyPlayerPoolCursor(null), 0);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("64"), 64);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("-1"), null);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("1.5"), null);
  assert.equal(parseProgressiveFantasyPlayerPoolCursor("9007199254740992"), null);
});
