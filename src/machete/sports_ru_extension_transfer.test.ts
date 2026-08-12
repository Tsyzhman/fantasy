import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSportsRuExtensionTransferPlayers,
  selectCurrentSportsRuContest,
  sportsRuContestTournamentHru,
  SportsRuExtensionTransferError
} from "./sports_ru_extension_transfer";

function squadPlayer(
  playerId: number,
  input: {
    starter?: boolean;
    captain?: boolean;
    vice?: boolean;
    position?: string;
    slotIndex?: number;
  } = {}
) {
  return {
    playerId: BigInt(playerId),
    position: input.position ?? "MID",
    isStarter: input.starter !== false,
    isCaptain: input.captain === true,
    isViceCaptain: input.vice === true,
    slotIndex: input.slotIndex ?? playerId - 1,
    player: { name: `Player ${playerId}` }
  };
}

function validSquadPlayers() {
  return [
    squadPlayer(1, { position: "GK" }),
    ...Array.from({ length: 4 }, (_, index) => squadPlayer(index + 2, { position: "DEF" })),
    squadPlayer(6, { captain: true }),
    squadPlayer(7, { vice: true }),
    squadPlayer(8),
    squadPlayer(9),
    squadPlayer(10, { position: "FWD" }),
    squadPlayer(11, { position: "FWD" }),
    squadPlayer(15, { starter: false, position: "GK", slotIndex: 11 }),
    squadPlayer(12, { starter: false, position: "DEF", slotIndex: 12 }),
    squadPlayer(13, { starter: false, position: "FWD", slotIndex: 13 }),
    squadPlayer(14, { starter: false, position: "MID", slotIndex: 14 })
  ];
}

function prices(season = "2026/2027") {
  return Array.from({ length: 15 }, (_, index) => ({
    playerId: BigInt(index + 1),
    providerPlayerId: `sports-${index + 1}`,
    playerName: `Sports Player ${index + 1}`,
    position: index === 0 || index === 14 ? "GK" : "MID",
    season
  }));
}

test("Sports.ru extension transfer exports the full XI, captains, and goalkeeper-last bench priorities", () => {
  const result = buildSportsRuExtensionTransferPlayers({
    squadPlayers: validSquadPlayers(),
    prices: prices(),
    preferredSeason: "2026/2027",
    expectedSquadSize: 15
  });

  assert.equal(result.length, 15);
  assert.equal(result.filter((player) => player.isStarting).length, 11);
  assert.equal(result.find((player) => player.isCaptain)?.providerPlayerId, "sports-6");
  assert.equal(result.find((player) => player.isViceCaptain)?.providerPlayerId, "sports-7");
  assert.deepEqual(
    result
      .filter((player) => !player.isStarting)
      .sort((left, right) => left.substitutePriority! - right.substitutePriority!)
      .map((player) => [player.providerPlayerId, player.substitutePriority]),
    [
      ["sports-12", 1],
      ["sports-13", 2],
      ["sports-14", 3],
      ["sports-15", 4]
    ]
  );
});

test("Sports.ru extension transfer prefers the current season provider ID over an alias", () => {
  const result = buildSportsRuExtensionTransferPlayers({
    squadPlayers: validSquadPlayers(),
    prices: [
      ...prices("2025/2026"),
      { ...prices("2026/2027")[5], providerPlayerId: "current-captain" }
    ],
    preferredSeason: "2026/2027",
    expectedSquadSize: 15
  });

  assert.equal(result.find((player) => player.isCaptain)?.providerPlayerId, "current-captain");
});

test("Sports.ru extension transfer fails closed when even one provider mapping is absent", () => {
  assert.throws(
    () => buildSportsRuExtensionTransferPlayers({
      squadPlayers: validSquadPlayers(),
      prices: prices().slice(0, 14),
      preferredSeason: "2026/2027",
      expectedSquadSize: 15
    }),
    (error) => error instanceof SportsRuExtensionTransferError && error.code === "SQUAD_MAPPING_INCOMPLETE"
  );
});

test("Sports.ru contest HRU uses structured rules and retains the source URL fallback", () => {
  assert.equal(
    sportsRuContestTournamentHru({
      sourceUrl: "https://www.sports.ru/fantasy/football/england/",
      rules: { tournamentHru: "russia" }
    }),
    "russia"
  );
  assert.equal(
    sportsRuContestTournamentHru({
      sourceUrl: "https://www.sports.ru/fantasy/football/england/",
      rules: null
    }),
    "england"
  );
});

test("Sports.ru extension selects the current contest even when an archived season was synced later", () => {
  const archived = {
    id: "archived-contest",
    leagueId: 63n,
    season: "2025/2026",
    name: "Archived RPL",
    squadSize: 15,
    sourceUrl: "https://www.sports.ru/fantasy/football/russia/",
    rules: { sportsRuSeasonId: "68" }
  };
  const current = {
    ...archived,
    season: "2026/2027",
    name: "Current RPL",
    rules: { sportsRuSeasonId: "75" }
  };

  assert.equal(
    selectCurrentSportsRuContest([archived, current], [{ leagueId: 63n, season: "2026/2027" }]),
    current
  );
});
