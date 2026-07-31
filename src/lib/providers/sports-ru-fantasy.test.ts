import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchSportsRuFantasyGraphqlSnapshot,
  fetchSportsRuLatestPublishedSquad,
  normalizeSportsRuProfileId,
  sportsRuTournamentHruFromUrl
} from "./sports-ru-fantasy";

test("Sports.ru GraphQL snapshot loads every position from the current season", async () => {
  const roles = new Map([
    ["GOALKEEPER", { id: "gk-1", name: "Goal Keeper", price: 5, team: { id: "1", name: "Ростов" } }],
    ["DEFENDER", { id: "def-1", name: "Left Back", price: 6, team: { id: "2", name: "Спартак" } }],
    ["MIDFIELDER", { id: "mid-1", name: "Play Maker", price: 8, team: { id: "3", name: "Зенит" } }],
    ["FORWARD", { id: "fwd-1", name: "Goal Scorer", price: 10, team: { id: "4", name: "Динамо" } }]
  ]);
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.signal, "Sports.ru requests must have a timeout signal");
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

test("Sports.ru snapshot corrects Arman Nahany before a provider typo can overwrite Hakeem Agboluaje", async () => {
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    if (query.includes("tournament(")) {
      return jsonResponse({ data: { fantasyQueries: { tournament: { currentSeason: { id: "76" } } } } });
    }
    if (query.includes("role: DEFENDER")) {
      return jsonResponse({ data: { fantasyQueries: { players: { list: [{
        id: "68255",
        name: "Хаким Агболуайе",
        price: 4,
        team: { id: "10235", name: "Фейеноорд" }
      }] } } } });
    }
    if (query.includes("role: MIDFIELDER")) {
      return jsonResponse({ data: { fantasyQueries: { players: { list: [{
        id: "68274",
        name: "Хаким Агболуайе",
        price: 4.5,
        team: { id: "10235", name: "Фейеноорд" }
      }] } } } });
    }
    return jsonResponse({ data: { fantasyQueries: { players: { list: [] } } } });
  }) as typeof fetch;

  const snapshot = await fetchSportsRuFantasyGraphqlSnapshot("netherlands", { fetchImpl, pageSize: 10 });

  assert.deepEqual(snapshot.prices.map((row) => [row.providerPlayerId, row.playerName, row.position, row.price]), [
    ["68255", "Хаким Агболуайе", "DEF", 4],
    ["68274", "Арман Нахани", "MID", 4.5]
  ]);
  assert.notEqual(snapshot.prices[0]?.normalizedName, snapshot.prices[1]?.normalizedName);
  assert.equal(snapshot.prices[1]?.sourceKind, "graphql-current-season-corrected");
});

test("Sports.ru snapshot uses the public mononym instead of an unwanted legal surname", async () => {
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    if (query.includes("tournament(")) return jsonResponse({ data: { fantasyQueries: { tournament: { currentSeason: { id: "75" } } } } });
    if (!query.includes("role: MIDFIELDER")) return jsonResponse({ data: { fantasyQueries: { players: { list: [] } } } });
    return jsonResponse({ data: { fantasyQueries: { players: { list: [{
      id: "67472",
      name: "Вендел Вале",
      price: 8.5,
      team: { id: "1", name: "Зенит" },
      statObject: { name: "Вендел Вале", firstName: "", lastName: "Вендел" }
    }] } } } });
  }) as typeof fetch;

  const snapshot = await fetchSportsRuFantasyGraphqlSnapshot("russia", { fetchImpl, pageSize: 10 });
  assert.equal(snapshot.prices[0]?.playerName, "Вендел");
});

test("Sports.ru tournament HRU is derived from a fantasy URL", () => {
  assert.equal(sportsRuTournamentHruFromUrl("https://www.sports.ru/fantasy/football/england/"), "england");
  assert.equal(sportsRuTournamentHruFromUrl("https://www.sports.ru/fantasy/football/"), null);
});

test("Sports.ru profile accepts only a numeric ID or canonical profile URL", () => {
  assert.equal(normalizeSportsRuProfileId("1090024123"), "1090024123");
  assert.equal(normalizeSportsRuProfileId("https://www.sports.ru/profile/1090024123/"), "1090024123");
  assert.equal(normalizeSportsRuProfileId("https://example.com/profile/1090024123/"), null);
  assert.equal(normalizeSportsRuProfileId("1090024123/fantasy"), null);
});

test("latest published Sports.ru squad falls back from an open tour to the latest public tour", async () => {
  const queries: string[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    queries.push(query);
    if (query.includes("squads(input:")) {
      return jsonResponse({ data: { fantasyQueries: { squads: [{
        id: "squad-1",
        name: "My team",
        createdAt: "2026-07-17T10:00:00Z",
        season: {
          id: "75",
          tournament: { name: "Russia", webName: "russia" },
          currentTour: { id: "tour-2", name: "2 тур", status: "OPENED" },
          tours: [
            { id: "tour-1", name: "1 тур", status: "FINISHED", finishedAt: "2026-07-20T20:00:00Z" },
            { id: "tour-2", name: "2 тур", status: "OPENED", startedAt: "2026-07-21T10:00:00Z" }
          ]
        },
        currentTourInfo: null
      }] } } });
    }
    if (query.includes('tourID: "tour-2"')) return jsonResponse({ data: { fantasyQueries: { squadTourInfo: null } } });
    return jsonResponse({ data: { fantasyQueries: { squadTourInfo: {
      tour: { id: "tour-1", name: "1 тур", status: "FINISHED", finishedAt: "2026-07-20T20:00:00Z" },
      totalPrice: 96,
      currentBalance: 4,
      players: [{
        seasonPlayer: { id: "player-1", name: "Иван Иванов", price: 6, role: "GOALKEEPER", team: { name: "Ростов" }, statObject: null },
        isCaptain: false,
        isViceCaptain: false,
        isStarting: true,
        substitutePriority: null
      }]
    } } } });
  }) as typeof fetch;

  const squad = await fetchSportsRuLatestPublishedSquad("1090024123", "75", { fetchImpl });

  assert.equal(squad?.tourId, "tour-1");
  assert.equal(squad?.players[0].providerPlayerId, "player-1");
  assert.equal(queries.length, 2);
  assert.equal(queries.some((query) => query.includes('tourID: "tour-2"')), false);
});

test("expected Sports.ru tour skips an exposed future current squad and loads the matching archive", async () => {
  const queries: string[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body ?? "{}"))?.query as string;
    queries.push(query);
    if (query.includes("squads(input:")) {
      return jsonResponse({ data: { fantasyQueries: { squads: [{
        id: "squad-1",
        name: "My team",
        createdAt: "2026-07-30T10:00:00Z",
        season: {
          id: "75",
          tournament: { name: "Russia", webName: "russia" },
          currentTour: { id: "tour-2", name: "2 тур", status: "OPENED" },
          tours: [
            { id: "tour-1", name: "1 тур", status: "FINISHED", finishedAt: "2026-07-25T20:00:00Z" },
            { id: "tour-2", name: "2 тур", status: "OPENED", startedAt: "2026-07-31T10:00:00Z" }
          ]
        },
        currentTourInfo: {
          tour: { id: "tour-2", name: "2 тур", status: "OPENED" },
          totalPrice: 100,
          currentBalance: 0,
          players: [{
            seasonPlayer: { id: "future-player", name: "Future Player", price: 7, role: "FORWARD", team: { name: "Future" }, statObject: null },
            isCaptain: true,
            isViceCaptain: false,
            isStarting: true,
            substitutePriority: null
          }]
        }
      }] } } });
    }
    assert.match(query, /tourID: "tour-1"/);
    return jsonResponse({ data: { fantasyQueries: { squadTourInfo: {
      tour: { id: "tour-1", name: "1 тур", status: "FINISHED", finishedAt: "2026-07-25T20:00:00Z" },
      totalPrice: 96,
      currentBalance: 4,
      players: [{
        seasonPlayer: { id: "published-player", name: "Published Player", price: 6, role: "GOALKEEPER", team: { name: "Published" }, statObject: null },
        isCaptain: false,
        isViceCaptain: false,
        isStarting: true,
        substitutePriority: null
      }]
    } } } });
  }) as typeof fetch;

  const squad = await fetchSportsRuLatestPublishedSquad("1090024123", "75", {
    fetchImpl,
    expectedTourNumber: 1
  });

  assert.equal(squad?.tourId, "tour-1");
  assert.equal(squad?.players[0].providerPlayerId, "published-player");
  assert.equal(queries.length, 2);
  assert.equal(queries.some((query) => query.includes('tourID: "tour-2"')), false);
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
