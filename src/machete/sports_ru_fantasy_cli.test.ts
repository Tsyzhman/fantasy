import assert from "node:assert/strict";
import test from "node:test";

import { parseSportsRuFantasyCliArgs, sportsRuFantasyCliBoolean } from "./sports_ru_fantasy_cli";

test("Sports.ru CLI accepts both inline and separate argument values", () => {
  assert.deepEqual(
    parseSportsRuFantasyCliArgs(["--league-id=47", "--season", "2026/2027", "--hru=england", "--dry-run"]),
    { "league-id": "47", season: "2026/2027", hru: "england", "dry-run": true }
  );
});

test("Sports.ru CLI parses explicit booleans without treating false as true", () => {
  assert.equal(sportsRuFantasyCliBoolean(true), true);
  assert.equal(sportsRuFantasyCliBoolean("yes"), true);
  assert.equal(sportsRuFantasyCliBoolean("false"), false);
  assert.throws(() => sportsRuFantasyCliBoolean("maybe"), /Expected a boolean/);
});
