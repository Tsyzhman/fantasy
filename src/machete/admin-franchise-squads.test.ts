import assert from "node:assert/strict";
import test from "node:test";

import { franchiseSquadAlternativeIssues } from "./admin-franchise-squads";

test("Alt warning checks only the starting XI and ignores the bench", () => {
  const selections = [
    { playerId: 1n, isStarter: true },
    { playerId: 2n, isStarter: false },
    { playerId: 3n, isStarter: true },
    { playerId: 4n, isStarter: true }
  ];
  const players = new Map([
    ["1", { name: "Starter Null", alternativePredictedFp: null }],
    ["2", { name: "Bench Zero", alternativePredictedFp: 0 }],
    ["3", { name: "Positive", alternativePredictedFp: 3.2 }]
  ]);

  assert.deepEqual(franchiseSquadAlternativeIssues(selections, players), [
    "Starter Null",
    "Игрок #4 (нет в пуле)"
  ]);
});
