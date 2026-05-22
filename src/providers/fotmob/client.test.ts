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

test("unofficial client fetches summary unsigned and matchDetails with x-mas", async () => {
  const originalFetch = globalThis.fetch;
  const originalInterval = process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
  const originalCookie = process.env.MACHETE_FOTMOB_COOKIE;
  process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = "0";
  process.env.MACHETE_FOTMOB_COOKIE = "turnstile_verified=test123; __cf_bm=abc";
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
      for (const [name, value] of Object.entries(rawHeaders as Record<string, string>)) {
        headers[name.toLowerCase()] = value;
      }
    }
    requests.push({ url, headers });

    if (url.includes("/api/data/match?")) {
      return jsonResponse({
        id: 4813565,
        home: { id: 8678, name: "AFC Bournemouth", score: 2 },
        away: { id: 9825, name: "Arsenal", score: 3 },
        status: { finished: true, utcTime: "2026-01-03T17:30:00.000Z" },
        pageUrl: "/matches/afc-bournemouth-vs-arsenal/2txefx#4813565"
      });
    }

    if (url.includes("/api/data/matchDetails?")) {
      return jsonResponse({
        general: {
          matchId: "4813565",
          leagueId: 47,
          homeTeam: { id: 8678, name: "AFC Bournemouth" },
          awayTeam: { id: 9825, name: "Arsenal" }
        },
        content: { playerStats: {}, shotmap: { shots: [] }, stats: {}, lineup: {} }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const details = await new UnofficialFotMobClient().getFixtureDetails("4813565");
    assert.equal((details.raw as { general?: { matchId?: string } }).general?.matchId, "4813565");

    const summaryReq = requests.find((r) => r.url.includes("/api/data/match?"));
    const detailReq = requests.find((r) => r.url.includes("/api/data/matchDetails?"));
    assert.ok(summaryReq, "summary fetch must happen");
    assert.ok(detailReq, "matchDetails fetch must happen");
    assert.equal(summaryReq.headers["x-mas"], undefined, "summary is unsigned");
    assert.match(detailReq.headers["x-mas"] ?? "", /.+/, "matchDetails carries x-mas");
    assert.equal(summaryReq.headers.cookie, "turnstile_verified=test123; __cf_bm=abc");
    assert.equal(detailReq.headers.cookie, "turnstile_verified=test123; __cf_bm=abc");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInterval === undefined) delete process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
    else process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = originalInterval;
    if (originalCookie === undefined) delete process.env.MACHETE_FOTMOB_COOKIE;
    else process.env.MACHETE_FOTMOB_COOKIE = originalCookie;
  }
});

test("unofficial client surfaces TURNSTILE_REQUIRED without retrying", async () => {
  const originalFetch = globalThis.fetch;
  const originalInterval = process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
  process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = "0";
  let calls = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls += 1;
    if (url.includes("/api/data/match?")) {
      return jsonResponse({
        id: 4813565,
        home: { id: 8678, score: 0 },
        away: { id: 9825, score: 0 },
        status: { finished: true, utcTime: "2026-01-03T17:30:00.000Z" }
      });
    }
    return new Response(JSON.stringify({ error: "Verification required", code: "TURNSTILE_REQUIRED" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => new UnofficialFotMobClient().getFixtureDetails("4813565"),
      (error: unknown) => error instanceof Error && /Cloudflare Turnstile/i.test(error.message)
    );
    // Summary call + exactly one matchDetails attempt (no retries on Turnstile).
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInterval === undefined) delete process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS;
    else process.env.MACHETE_FOTMOB_REQUEST_INTERVAL_MS = originalInterval;
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
