import assert from "node:assert/strict";
import test from "node:test";

import { classifyShotSituation, shotMatchesSituationFilter } from "./shot-filters";

test("FotMob open play situations are treated as open play", () => {
  assert.equal(classifyShotSituation("RegularPlay"), "open_play");
  assert.equal(classifyShotSituation("FastBreak"), "open_play");
  assert.equal(classifyShotSituation("IndividualPlay"), "open_play");
});

test("open play filter is inverse of penalties and set pieces", () => {
  assert.equal(shotMatchesSituationFilter("Penalty", "open_play"), false);
  assert.equal(shotMatchesSituationFilter("FromCorner", "open_play"), false);
  assert.equal(shotMatchesSituationFilter("FreeKick", "open_play"), false);
  assert.equal(shotMatchesSituationFilter("ThrowInSetPiece", "open_play"), false);
  assert.equal(shotMatchesSituationFilter(null, "open_play"), true);
});

test("FotMob set-piece situations are grouped together", () => {
  assert.equal(classifyShotSituation("FromCorner"), "set_piece");
  assert.equal(classifyShotSituation("FreeKick"), "set_piece");
  assert.equal(classifyShotSituation("SetPiece"), "set_piece");
  assert.equal(classifyShotSituation("ThrowInSetPiece"), "set_piece");
});
