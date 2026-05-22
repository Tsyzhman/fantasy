import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlannerRoundFixtures,
  buildTeamStrengthProfilesFromMatches,
  fantasyPlannerPosition,
  projectFixtureFantasyPoints,
  sportsRuFantasyPriceRefsByScopedPlayer,
  sportsRuFantasyPriceScopeKey,
  sportsRuFantasyPositionsByPlayerId,
  sportsRuPricePosition,
  sportsRuSeasonAliases
} from "./squad_planner";

test("squad planner groups upcoming matches into fixture rounds", () => {
  const result = buildPlannerRoundFixtures(
    [
      match({ id: "1", round: "12", date: "2026-05-25T17:00:00.000Z", homeTeamId: "10", awayTeamId: "20" }),
      match({ id: "2", round: "12", date: "2026-05-25T19:00:00.000Z", homeTeamId: "30", awayTeamId: "40" }),
      match({ id: "3", round: "13", date: "2026-06-01T17:00:00.000Z", homeTeamId: "10", awayTeamId: "30" })
    ],
    new Date("2026-05-22T00:00:00.000Z")
  );

  assert.equal(result.rounds.length, 2);
  assert.equal(result.rounds[0].label, "Round 12");
  assert.equal(result.rounds[0].fixtureCount, 2);
  assert.equal(result.fixturesByTeamRound.get("round:12")?.get("10")?.[0].opponentName, "Away 20");
  assert.equal(result.fixturesByTeamRound.get("round:12")?.get("10")?.[0].opponentTeamId, "20");
});

test("sports ru season aliases support long and compact FotMob season labels", () => {
  assert.deepEqual(sportsRuSeasonAliases("2025/2026"), ["2025/2026", "2025/26"]);
  assert.deepEqual(sportsRuSeasonAliases("2025/26"), ["2025/26", "2025/2026"]);
});

test("squad planner prefers Sports.ru position over FotMob roster position", () => {
  assert.equal(fantasyPlannerPosition("DEF", "Midfielder", "Forward"), "DEF");
  assert.equal(fantasyPlannerPosition(null, "Midfielder", "Forward"), "Midfielder");
  assert.equal(fantasyPlannerPosition("unknown", "Defender", "Forward"), "Defender");
});

test("squad planner resolves Sports.ru positions through manual mappings", () => {
  const positions = sportsRuFantasyPositionsByPlayerId(
    [
      { id: "price-1", playerId: 7n, position: "UNKNOWN", raw: { source: "xlsx", positionLabel: "\u041f\u0417" } },
      { id: "price-2", playerId: 8n, position: "DEF" }
    ],
    [{ providerEntityId: "price-1", internalEntityId: "42" }]
  );

  assert.equal(positions.get("42"), "MID");
  assert.equal(positions.get("7"), undefined);
  assert.equal(positions.get("8"), "DEF");
});

test("squad planner resolves scoped Sports.ru price refs through manual mappings and season aliases", () => {
  const refs = sportsRuFantasyPriceRefsByScopedPlayer(
    [
      { id: "price-1", leagueId: 47n, season: "2025/26", playerId: 7n, playerName: "Sports Name", position: "UNKNOWN", raw: { source: "xlsx", positionLabel: "\u041f\u0417" }, price: 6.5 },
      { id: "price-2", leagueId: 47n, season: "2025/26", playerId: 8n, playerName: "Direct Name", position: "DEF", price: 5 }
    ],
    [{ providerEntityId: "price-1", internalEntityId: "42" }]
  );

  const mapped = refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/2026", "42"));
  assert.equal(mapped?.playerName, "Sports Name");
  assert.equal(mapped?.position, "MID");
  assert.equal(mapped?.price, 6.5);
  assert.equal(refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/26", "7")), undefined);
  assert.equal(refs.get(sportsRuFantasyPriceScopeKey(47n, "2025/26", "8"))?.playerName, "Direct Name");
});

test("squad planner recovers Sports.ru positions from raw price metadata", () => {
  assert.equal(sportsRuPricePosition({ position: "UNKNOWN", raw: { source: "xlsx", positionLabel: "\u0412\u0420" } }), "GK");
  assert.equal(sportsRuPricePosition({ position: "UNKNOWN", raw: { source: "xlsx", positionLabel: "\u0417\u0430\u0449" } }), "DEF");
  assert.equal(sportsRuPricePosition({ position: null, raw: { source: "featured-field", rowIndex: 2 } }), "MID");
  assert.equal(sportsRuPricePosition({ position: null, raw: { source: "featured-field-fallback", index: 9 } }), "FWD");
});

test("team strength profiles derive attack and defense from parsed match xG", () => {
  const profiles = buildTeamStrengthProfilesFromMatches([
    {
      homeTeamId: "10",
      awayTeamId: "20",
      teamStats: [
        { teamId: "10", isHome: true, xg: 2 },
        { teamId: "20", isHome: false, xg: 0.4 }
      ]
    },
    {
      homeTeamId: "30",
      awayTeamId: "20",
      teamStats: [
        { teamId: "30", isHome: true, xg: 1.5 },
        { teamId: "20", isHome: false, xg: 0.6 }
      ]
    }
  ]);

  const team = profiles.byTeamId.get("20");
  assert.equal(team?.away.matches, 2);
  assert.equal(team?.away.xgForPerMatch, 0.5);
  assert.equal(team?.away.xgAgainstPerMatch, 1.75);
});

test("fixture projection weights opponent difficulty by fantasy position", () => {
  const homeOnly = projectFixtureFantasyPoints(10, "FWD", {
    side: "H",
    attackMultiplier: null,
    defenseMultiplier: null
  });
  const attackerAgainstStrongDefense = projectFixtureFantasyPoints(10, "FWD", {
    side: "H",
    attackMultiplier: 0.75,
    defenseMultiplier: 1
  });
  const defenderInGoodCleanSheetSpot = projectFixtureFantasyPoints(10, "DEF", {
    side: "H",
    attackMultiplier: 1,
    defenseMultiplier: 1.25
  });

  assert.ok(attackerAgainstStrongDefense < homeOnly);
  assert.ok(defenderInGoodCleanSheetSpot > homeOnly);
});

function match(input: {
  id: string;
  round: string | null;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
}) {
  return {
    id: input.id,
    round: input.round,
    matchDate: new Date(input.date),
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeTeamName: `Home ${input.homeTeamId}`,
    awayTeamName: `Away ${input.awayTeamId}`,
    finished: false,
    cancelled: false
  };
}
