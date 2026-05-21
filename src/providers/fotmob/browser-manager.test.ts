import assert from "node:assert/strict";
import test from "node:test";

import { fotMobApiUrlMatchId, isMatchDetailsUrlForMatch } from "./browser-manager";

test("browser matchDetails matcher accepts only the requested match id", () => {
  assert.equal(
    isMatchDetailsUrlForMatch("https://www.fotmob.com/api/data/matchDetails?matchId=4813374", "4813374"),
    true
  );
  assert.equal(
    isMatchDetailsUrlForMatch("https://www.fotmob.com/api/data/matchDetails?matchId=4813595", "4813374"),
    false
  );
});

test("browser matchDetails matcher handles encoded nested urls", () => {
  const nested = encodeURIComponent("/api/data/matchDetails?matchId=4813374");
  assert.equal(
    isMatchDetailsUrlForMatch(`https://www.fotmob.com/proxy?url=${nested}`, "4813374"),
    true
  );
});

test("browser FotMob API match id detector ignores team-scoped ids", () => {
  assert.equal(fotMobApiUrlMatchId("https://www.fotmob.com/api/data/matchOdds?matchId=4813610&ccode3=RUS"), "4813610");
  assert.equal(fotMobApiUrlMatchId("https://www.fotmob.com/api/data/matchNews?id=4813610&ccode3=RUS"), "4813610");
  assert.equal(fotMobApiUrlMatchId("https://www.fotmob.com/api/data/nextmatch?teamId=10252"), null);
  assert.equal(fotMobApiUrlMatchId("https://www.fotmob.com/api/data/matchDetails?matchId=%5Bobject+Object%5D"), null);
});
