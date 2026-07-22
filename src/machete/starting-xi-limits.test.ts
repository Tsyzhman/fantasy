import assert from "node:assert/strict";
import test from "node:test";

import { startingXiSelectionBlockReason } from "./starting-xi-limits";

test("starting XI accepts exactly one goalkeeper and ten outfield players", () => {
  const goalkeeper = { position: "Goalkeeper", isStarter: true };
  const outfield = Array.from({ length: 10 }, () => ({ position: "Defender", isStarter: true }));

  assert.equal(startingXiSelectionBlockReason(outfield, { position: "GK", isStarter: false }), null);
  assert.equal(
    startingXiSelectionBlockReason([goalkeeper], { position: "Goalkeeper", isStarter: false }),
    "STARTING_XI_GOALKEEPER_LIMIT"
  );
  assert.equal(
    startingXiSelectionBlockReason(outfield, { position: "Midfielder", isStarter: false }),
    "STARTING_XI_OUTFIELD_LIMIT"
  );
  assert.equal(
    startingXiSelectionBlockReason([goalkeeper, ...outfield], { position: "Forward", isStarter: false }),
    "STARTING_XI_LIMIT"
  );
});

test("an already selected player can always be removed from an invalid starting XI", () => {
  const oversizedRoster = Array.from({ length: 12 }, () => ({ position: "Defender", isStarter: true }));
  assert.equal(startingXiSelectionBlockReason(oversizedRoster, oversizedRoster[0]), null);
});
