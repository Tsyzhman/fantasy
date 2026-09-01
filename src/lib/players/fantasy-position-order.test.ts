import assert from "node:assert/strict";
import test from "node:test";

import { compareFantasyPositions, fantasyPositionOrder, fantasyPositionRank, isFantasyPositionSortKey } from "./fantasy-position-order";

test("fantasy positions use the site-wide forward-to-goalkeeper order", () => {
  const values = ["GK", "UNK", "DEF", "FWD", "MID"];
  assert.deepEqual([...values].sort((left, right) => compareFantasyPositions(left, right)), [...fantasyPositionOrder]);
  assert.deepEqual([...values].sort((left, right) => compareFantasyPositions(left, right, "desc")), ["GK", "DEF", "MID", "FWD", "UNK"]);
});

test("fantasy position aliases share ranks and unknown values remain last", () => {
  assert.equal(fantasyPositionRank("forward"), fantasyPositionRank("FWD"));
  assert.equal(fantasyPositionRank("goalkeeper"), fantasyPositionRank("GK"));
  assert.ok(compareFantasyPositions("UNKNOWN", "GK") > 0);
  assert.equal(isFantasyPositionSortKey("positionGroup"), true);
});
