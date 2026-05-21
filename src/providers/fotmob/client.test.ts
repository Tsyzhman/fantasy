import assert from "node:assert/strict";
import test from "node:test";

import { extractLeagueTeamsFromLeaguePayload, is_placeholder_team, UnofficialFotMobClient } from "./client";

test("normal standings payload still works", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    table: [
      {
        data: {
          table: {
            all: [
              { id: 1, name: "Arsenal", shortName: "ARS" },
              { id: "2", name: "Chelsea" }
            ]
          }
        }
      }
    ],
    matches: [
      {
        home: { id: "99", name: "Fallback FC" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "1", name: "Arsenal", shortName: "ARS" },
    { id: "2", name: "Chelsea", shortName: undefined }
  ]);
});

test("real fixtures with home/away returns teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    matches: [
      {
        home: { id: "101", name: "Argentina", shortName: "ARG" },
        away: { teamId: "102", teamName: "Brazil" },
        team: { id: "999", name: "Bracket Decoration" },
        opponent: { id: "998", name: "Generic Opponent" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "101", name: "Argentina", shortName: "ARG" },
    { id: "102", name: "Brazil", shortName: undefined }
  ]);
});

test("real fixtures with homeTeam/awayTeam returns teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    groups: [
      {
        rounds: [
          {
            fixtures: [
              {
                match: {
                  homeTeam: { teamId: 201, teamName: "Canada" },
                  awayTeam: { id: 202, name: "Mexico" }
                }
              }
            ]
          }
        ]
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "201", name: "Canada", shortName: undefined },
    { id: "202", name: "Mexico", shortName: undefined }
  ]);
});

test("placeholder fixtures are ignored", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    fixtures: [
      {
        home: { id: "401", name: "TBD" },
        away: { teamId: "402", teamName: "Winner Group A" }
      },
      {
        homeTeam: { teamId: "403", teamName: "1A" },
        awayTeam: { id: "404", name: "Победитель Группа B" }
      },
      {
        home: { id: "405", name: "W49" },
        away: { id: "406", name: "To be decided" }
      }
    ]
  });

  assert.deepEqual(teams, []);
});

test("mixed real and placeholder fixtures return only real teams", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    rounds: [
      {
        match: {
          homeTeam: { teamId: 501, teamName: "Japan" },
          awayTeam: { teamId: 502, teamName: "Runner-up Group B" }
        }
      },
      {
        match: {
          homeTeam: { teamId: 503, teamName: "Germany" },
          awayTeam: { teamId: 504, teamName: "Unknown" }
        }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "501", name: "Japan", shortName: undefined },
    { id: "503", name: "Germany", shortName: undefined }
  ]);
});

test("empty payload returns empty array", () => {
  assert.deepEqual(extractLeagueTeamsFromLeaguePayload({}), []);
});

test("duplicate teams are deduplicated and numeric ids are preferred", () => {
  const teams = extractLeagueTeamsFromLeaguePayload({
    fixtures: [
      {
        home: { name: "USA" },
        away: { id: "302", name: "Uruguay" }
      },
      {
        homeTeam: { teamId: "301", teamName: "USA" },
        awayTeam: { id: "302", name: "Uruguay" }
      },
      {
        home: { id: "not-a-fotmob-id", name: "South Korea" },
        away: { teamId: "303", teamName: "South Korea" }
      }
    ]
  });

  assert.deepEqual(teams, [
    { id: "301", name: "USA", shortName: undefined },
    { id: "302", name: "Uruguay", shortName: undefined },
    { id: "303", name: "South Korea", shortName: undefined }
  ]);
});

test("World Cup fallback warns when more than 48 teams remain after filtering", () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    const matches = Array.from({ length: 25 }, (_, index) => ({
      home: { id: String(1000 + index * 2), name: `Team ${index * 2 + 1}` },
      away: { id: String(1001 + index * 2), name: `Team ${index * 2 + 2}` }
    }));

    const teams = extractLeagueTeamsFromLeaguePayload({ matches }, { leagueId: "77", season: "2026" });

    assert.equal(teams.length, 50);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /World Cup fallback extracted 50 teams/);
  } finally {
    console.warn = originalWarn;
  }
});

test("placeholder team detection covers known playoff labels", () => {
  for (const name of ["TBD", "TBA", "Winner Group A", "Runner-up Group B", "1A", "B2", "W49", "L50", "To be decided", "Unknown", "Placeholder", "Победитель", "Группа A"]) {
    assert.equal(is_placeholder_team(name), true, name);
  }

  assert.equal(is_placeholder_team("Argentina"), false);
});

test("unofficial client fetches matchDetails via the next-data endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalInterval = process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
  process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = "0";
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);

    if (url === "https://www.fotmob.com/") {
      return textResponse(`<html><body><script>{"props":{"pageProps":{}},"buildId":"abc123"}</script></body></html>`);
    }

    if (url === "https://www.fotmob.com/_next/data/abc123/match/4813565.json") {
      return jsonResponse({
        pageProps: { __N_REDIRECT: "/matches/afc-bournemouth-vs-arsenal/2txefx#4813565" }
      });
    }

    if (url === "https://www.fotmob.com/_next/data/abc123/matches/afc-bournemouth-vs-arsenal/2txefx.json") {
      return jsonResponse({
        pageProps: {
          general: {
            matchId: "4813565",
            leagueId: "47",
            matchTimeUTCDate: "2026-01-03T17:30:00.000Z",
            homeTeam: { id: 8678, name: "AFC Bournemouth" },
            awayTeam: { id: 9825, name: "Arsenal" }
          },
          header: { status: { finished: true }, teams: [{ score: 2 }, { score: 3 }] },
          content: { playerStats: {}, shotmap: { shots: [] }, stats: {}, lineup: {} }
        }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const details = await new UnofficialFotMobClient().getFixtureDetails("4813565");
    assert.equal((details.raw as { general?: { matchId?: string } }).general?.matchId, "4813565");
    assert.equal(details.homeScore, 2);
    assert.equal(details.awayScore, 3);
    assert.equal(details.status, "FINISHED");
    assert.equal(urls.some((url) => url.includes("/api/data/matchDetails")), false, "must not call signed matchDetails");
    assert.equal(urls.filter((url) => url === "https://www.fotmob.com/").length, 1, "buildId is fetched once per session");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInterval === undefined) {
      delete process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
    } else {
      process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = originalInterval;
    }
  }
});

test("unofficial client falls back to signed matchDetails on slug-collision id mismatch", async () => {
  const originalFetch = globalThis.fetch;
  const originalInterval = process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
  process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = "0";
  const signedCalls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === "https://www.fotmob.com/") {
      return textResponse(`<html><script>"buildId":"abc"</script></html>`);
    }

    if (url === "https://www.fotmob.com/_next/data/abc/match/4506554.json") {
      return jsonResponse({
        pageProps: { __N_REDIRECT: "/matches/arsenal-vs-crystal-palace/xyz#4506554" }
      });
    }

    if (url === "https://www.fotmob.com/_next/data/abc/matches/arsenal-vs-crystal-palace/xyz.json") {
      // FotMob serves the canonical (current-season) match for this slug.
      return jsonResponse({
        pageProps: {
          general: { matchId: "4813747", leagueId: "47", homeTeam: { id: 9825 }, awayTeam: { id: 9826 } },
          header: { status: { finished: true }, teams: [{ score: 1 }, { score: 0 }] },
          content: { playerStats: {} }
        }
      });
    }

    if (url.includes("/api/data/matchDetails?")) {
      signedCalls.push(url);
      return jsonResponse({
        general: { matchId: "4506554", leagueId: "47", homeTeam: { id: 9825 }, awayTeam: { id: 9826 } },
        header: { status: { finished: true }, teams: [{ score: 2 }, { score: 1 }] },
        content: { playerStats: {}, shotmap: { shots: [] }, stats: {} }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const details = await new UnofficialFotMobClient().getFixtureDetails("4506554");
    assert.equal((details.raw as { general?: { matchId?: string } }).general?.matchId, "4506554");
    assert.equal(details.homeScore, 2);
    assert.equal(signedCalls.length, 1, "signed matchDetails fallback must run exactly once");
    assert.ok(signedCalls[0].includes("matchId=4506554"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInterval === undefined) {
      delete process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
    } else {
      process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = originalInterval;
    }
  }
});

test("unofficial client refetches buildId after a stale next-data 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalInterval = process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
  process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = "0";
  let buildIdRequests = 0;
  let staleSlugServed = false;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === "https://www.fotmob.com/") {
      buildIdRequests += 1;
      const buildId = buildIdRequests === 1 ? "stale" : "fresh";
      return textResponse(`<html><script>"buildId":"${buildId}"</script></html>`);
    }

    if (url.includes("/_next/data/stale/match/")) {
      staleSlugServed = true;
      return new Response("not found", { status: 404 });
    }

    if (url === "https://www.fotmob.com/_next/data/fresh/match/4813565.json") {
      return jsonResponse({
        pageProps: { __N_REDIRECT: "/matches/whatever/abc#4813565" }
      });
    }

    if (url === "https://www.fotmob.com/_next/data/fresh/matches/whatever/abc.json") {
      return jsonResponse({
        pageProps: {
          general: {
            matchId: "4813565",
            leagueId: "47",
            homeTeam: { id: 1 },
            awayTeam: { id: 2 }
          },
          header: { status: { finished: true }, teams: [{ score: 0 }, { score: 0 }] },
          content: { playerStats: {} }
        }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const details = await new UnofficialFotMobClient().getFixtureDetails("4813565");
    assert.equal((details.raw as { general?: { matchId?: string } }).general?.matchId, "4813565");
    assert.equal(buildIdRequests, 2, "buildId must be refetched after the stale 404");
    assert.ok(staleSlugServed, "must hit stale buildId first");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInterval === undefined) {
      delete process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
    } else {
      process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = originalInterval;
    }
  }
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function textResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}
