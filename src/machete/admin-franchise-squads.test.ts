import assert from "node:assert/strict";
import test from "node:test";

import type { FantasyPlannerPlayer } from "./squad_logic";
import { franchiseSquadAlternativeIssues, franchiseSquadPreviewPlayers } from "./admin-franchise-squads";

test("Alt warning checks only the starting XI and ignores the bench", () => {
  const selections = [
    { playerId: 1n, isStarter: true },
    { playerId: 2n, isStarter: false },
    { playerId: 3n, isStarter: true },
    { playerId: 4n, isStarter: true }
  ];
  const players = new Map([
    ["1", { name: "Starter Null", alternativePredictedFp: 4, alternativeRoundPoints: [null] }],
    ["2", { name: "Bench Zero", alternativePredictedFp: 0 }],
    ["3", { name: "Positive", alternativePredictedFp: 3.2, alternativeRoundPoints: [3.2] }]
  ]);

  assert.deepEqual(franchiseSquadAlternativeIssues(selections, players), [
    "Starter Null",
    "Игрок #4 (нет в пуле)"
  ]);
});

test("franchise preview keeps squad order and read-only selection flags", () => {
  const selections = [
    { playerId: 2n, isStarter: false, isCaptain: false, isViceCaptain: true, slotIndex: 12 },
    { playerId: 1n, isStarter: true, isCaptain: true, isViceCaptain: false, slotIndex: 0 }
  ];
  const player = (playerId: string, name: string): FantasyPlannerPlayer => ({
    id: playerId,
    playerId,
    teamId: "10",
    name,
    teamName: "Крылья Советов",
    teamShortName: "KRY",
    leagueName: "РПЛ",
    position: "Forward",
    positionGroup: "FWD",
    price: 8.5,
    priceSource: "SPORTS_RU",
    predictedFp: 5.2,
    alternativePredictedFp: 4.8,
    foontasyPoints: 5.5,
    valueScore: 0.61,
    roundPoints: [5.2, 4.9, 5.1, 4.7],
    alternativeRoundPoints: [4.8, 4.6, 4.9, 4.4],
    fixtures: ["ZEN (H)", "CSK (A)", "DIN (H)", "LOK (A)"],
    fixtureFullNames: ["Зенит", "ЦСКА", "Динамо", "Локомотив"],
    fixtureDifficulties: [5, 4, 3, 4],
    expectedMinutes: 72
  });
  const preview = franchiseSquadPreviewPlayers(selections, new Map([
    ["1", player("1", "Игрок основы")],
    ["2", player("2", "Игрок запаса")]
  ]));

  assert.deepEqual(preview.map(({ playerId, slotIndex, isStarter, isCaptain, isViceCaptain }) => ({
    playerId, slotIndex, isStarter, isCaptain, isViceCaptain
  })), [
    { playerId: "1", slotIndex: 0, isStarter: true, isCaptain: true, isViceCaptain: false },
    { playerId: "2", slotIndex: 12, isStarter: false, isCaptain: false, isViceCaptain: true }
  ]);
  assert.deepEqual(preview[0].roundPoints, [5.2, 4.9, 5.1]);
  assert.deepEqual(preview[0].fixtures, ["ZEN (H)", "CSK (A)", "DIN (H)"]);
});
