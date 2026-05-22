import assert from "node:assert/strict";
import test from "node:test";

import { buildSportsRuMappingCandidates, planSportsRuSelectionRemap, scoreSportsRuCandidate } from "./sports_ru_player_mapping";

const liverpool = { name: "Liverpool" };
const city = { name: "Manchester City" };

test("sports ru mapping matches transliterated surname to FotMob roster name", () => {
  const result = scoreSportsRuCandidate(
    price("van deyk", "DEF"),
    roster("Virgil van Dijk", "DEF", liverpool)
  );

  assert.equal(result.confidence >= 0.78, true);
});

test("sports ru mapping prefers same-position team roster candidate", () => {
  const candidates = buildSportsRuMappingCandidates(
    price("alisson", "GK"),
    [
      roster("Alisson Becker", "GK", liverpool, 1n),
      roster("Ederson", "GK", city, 2n),
      roster("Allan Saint-Maximin", "FW", city, 3n)
    ]
  );

  assert.equal(candidates[0].playerName, "Alisson Becker");
  assert.equal(candidates[0].confidence > candidates[1].confidence, true);
});

test("sports ru mapping penalizes known position mismatch", () => {
  const defender = scoreSportsRuCandidate(price("gabriel", "DEF"), roster("Gabriel Magalhaes", "DEF", { name: "Arsenal" }));
  const forward = scoreSportsRuCandidate(price("gabriel", "FWD"), roster("Gabriel Magalhaes", "DEF", { name: "Arsenal" }));

  assert.equal(defender.confidence > forward.confidence, true);
});

test("sports ru mapping remap moves stale squad picks and removes same-squad duplicates", () => {
  const plan = planSportsRuSelectionRemap(
    [
      { id: "stale-a", squadId: "squad-a" },
      { id: "stale-b", squadId: "squad-b" }
    ],
    [{ id: "target-b", squadId: "squad-b" }]
  );

  assert.deepEqual(plan.moveSelectionIds, ["stale-a"]);
  assert.deepEqual(plan.deleteSelectionIds, ["stale-b"]);
});

function price(normalizedName: string, position: string) {
  return {
    id: normalizedName,
    playerName: normalizedName,
    normalizedName,
    teamName: "",
    position,
    price: 6
  };
}

function roster(name: string, position: string, team: { name: string }, playerId = 10n) {
  return {
    playerId,
    teamId: playerId + 100n,
    position,
    player: { name },
    team
  };
}
