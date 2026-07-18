import assert from "node:assert/strict";
import test from "node:test";

import { fetchSportsRuFantasyGraphqlSnapshot, sportsRuTournamentHruFromUrl } from "./sports-ru-fantasy";

test("Sports.ru GraphQL snapshot loads every position from the current season", async () => {
  const roles = new Map([
    ["GOALKEEPER", { id: "gk-1", name: "Goal Keeper", price: 5, team: { id: "1", name: "Ростов" } }],
    ["DEFENDER", { id: "def-1", name: "Left Back", price: 6, team: { id: "2", name: "Спартак" } }],
    ["MIDFIELDER", { id: "mid-1", name: "Play Maker", price: 8, team: { id: "3", name: "Зенит" } }],
    ["FORWARD", { id: "fwd-1", name: "Goal Scorer", price: 10, team: { id: "4", name: "Динамо" } }]
  ]);
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    if (query.includes("tournament(")) return jsonResponse({ data: { fantasyQueries: { tournament: { currentSeason: { id: "season-1" } } } } });
    assert.match(query, /team \{ id name \}/);
    const role = [...roles.keys()].find((value) => query.includes(`role: ${value}`));
    const player = role ? roles.get(role) : null;
    return jsonResponse({ data: { fantasyQueries: { players: { list: player ? [player] : [] } } } });
  }) as typeof fetch;

  const snapshot = await fetchSportsRuFantasyGraphqlSnapshot("england", { fetchImpl, pageSize: 10 });

  assert.equal(snapshot.seasonId, "season-1");
  assert.deepEqual(snapshot.prices.map((row) => row.position), ["GK", "DEF", "MID", "FWD"]);
  assert.deepEqual(snapshot.prices.map((row) => row.providerPlayerId), ["gk-1", "def-1", "mid-1", "fwd-1"]);
  assert.deepEqual(snapshot.prices.map((row) => row.teamName), ["Ростов", "Спартак", "Зенит", "Динамо"]);
});

test("Sports.ru snapshot fails closed when no current season exists", async () => {
  const fetchImpl = (async () => jsonResponse({ data: { fantasyQueries: { tournament: { currentSeason: null } } } })) as typeof fetch;

  const snapshot = await fetchSportsRuFantasyGraphqlSnapshot("england", { fetchImpl });

  assert.equal(snapshot.seasonId, null);
  assert.deepEqual(snapshot.prices, []);
});

test("Sports.ru snapshot keeps same-name players from different teams", async () => {
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    if (query.includes("tournament(")) return jsonResponse({ data: { fantasyQueries: { tournament: { currentSeason: { id: "season-1" } } } } });
    if (!query.includes("role: DEFENDER")) return jsonResponse({ data: { fantasyQueries: { players: { list: [] } } } });
    return jsonResponse({
      data: {
        fantasyQueries: {
          players: {
            list: [
              { id: "roberto-1", name: "Роберто Фернандес", price: 5, team: { id: "1", name: "Акрон" } },
              { id: "roberto-2", name: "Роберто Фернандес", price: 5.5, team: { id: "2", name: "Динамо" } }
            ]
          }
        }
      }
    });
  }) as typeof fetch;

  const snapshot = await fetchSportsRuFantasyGraphqlSnapshot("russia", { fetchImpl, pageSize: 10 });

  assert.equal(snapshot.prices.length, 2);
  assert.deepEqual(snapshot.prices.map((row) => [row.providerPlayerId, row.teamName]), [
    ["roberto-1", "Акрон"],
    ["roberto-2", "Динамо"]
  ]);
});

test("Sports.ru tournament HRU is derived from a fantasy URL", () => {
  assert.equal(sportsRuTournamentHruFromUrl("https://www.sports.ru/fantasy/football/england/"), "england");
  assert.equal(sportsRuTournamentHruFromUrl("https://www.sports.ru/fantasy/football/"), null);
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
