import assert from "node:assert/strict";
import test from "node:test";

import { withEnv } from "../../test-utils/env";
import { extractLeagueTeamsFromLeaguePayload, is_placeholder_team, UnofficialFotMobClient } from "./client";

class InspectableUnofficialFotMobClient extends UnofficialFotMobClient {
  getRequestIntervalMs() {
    return this.requestIntervalMs;
  }
}

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

test("unofficial client uses a safe request interval by default", async () => {
  await withEnv({ MACHETE_FOTMOB_REQUEST_INTERVAL_MS: undefined }, async () => {
    assert.equal(new InspectableUnofficialFotMobClient().getRequestIntervalMs(), 1500);
  });
});

test("unofficial client allows request throttling to be disabled explicitly", async () => {
  await withEnv({ MACHETE_FOTMOB_REQUEST_INTERVAL_MS: "0" }, async () => {
    assert.equal(new InspectableUnofficialFotMobClient().getRequestIntervalMs(), 0);
  });
});

test("unofficial client fetches matchDetails via the playbyplay next-data endpoint", async () => {
  await withEnv({ MACHETE_FOTMOB_REQUEST_INTERVAL_MS: "0" }, async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);

      if (url === "https://www.fotmob.com" || url === "https://www.fotmob.com/") {
        return textResponse(`<html><script>"buildId":"abc"</script></html>`);
      }

      if (url.includes("/api/data/match?")) {
        return jsonResponse({
          id: 4813565,
          home: { id: 8678, name: "AFC Bournemouth", score: 2 },
          away: { id: 9825, name: "Arsenal", score: 3 },
          status: { finished: true, utcTime: "2026-01-03T17:30:00.000Z" }
        });
      }

      if (url === "https://www.fotmob.com/_next/data/abc/match/4813565/playbyplay.json") {
        return jsonResponse({
          pageProps: {
            general: { matchId: "4813565", leagueId: 47, homeTeam: { id: 8678 }, awayTeam: { id: 9825 } },
            header: { status: { finished: true }, teams: [{ score: 2 }, { score: 3 }] },
            content: { matchFacts: {}, playerStats: {}, shotmap: { shots: [] }, stats: {}, lineup: {} }
          }
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const details = await new UnofficialFotMobClient().getFixtureDetails("4813565");
      assert.equal((details.raw as { general?: { matchId?: string } }).general?.matchId, "4813565");
      assert.equal(urls.some((u) => u.includes("/api/data/matchDetails")), false, "must not hit signed matchDetails");
      assert.equal(urls.some((u) => u.includes("/playbyplay.json")), true, "must use playbyplay endpoint");
      assert.equal(urls.filter((u) => u === "https://www.fotmob.com" || u === "https://www.fotmob.com/").length, 1, "buildId fetched once");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("unofficial client retries transient FotMob API failures", async () => {
  await withEnv(
    {
      MACHETE_FOTMOB_API_ATTEMPTS: "2",
      MACHETE_FOTMOB_REQUEST_INTERVAL_MS: "0",
      MACHETE_FOTMOB_RETRY_BASE_DELAY_MS: "0",
      MACHETE_FOTMOB_RETRY_JITTER_MS: "0"
    },
    async () => {
      const originalFetch = globalThis.fetch;
      const originalWarn = console.warn;
      let attempts = 0;
      console.warn = () => undefined;

      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        assert.match(url, /\/api\/data\/fixtures\?/);
        attempts += 1;

        if (attempts === 1) {
          return new Response("temporarily unavailable", { status: 503, statusText: "Service Unavailable" });
        }

        return jsonResponse([
          {
            id: 4813565,
            home: { id: 8678, score: 2 },
            away: { id: 9825, score: 3 },
            status: { finished: true, utcTime: "2026-01-03T17:30:00.000Z" }
          }
        ]);
      }) as typeof fetch;

      try {
        const fixtures = await new UnofficialFotMobClient().getFixtures("47", "2025/2026");

        assert.equal(attempts, 2);
        assert.equal(fixtures.length, 1);
        assert.equal(fixtures[0]?.id, "4813565");
      } finally {
        globalThis.fetch = originalFetch;
        console.warn = originalWarn;
      }
    }
  );
});

test("unofficial client refetches buildId after a stale playbyplay 404", async () => {
  await withEnv({ MACHETE_FOTMOB_REQUEST_INTERVAL_MS: "0" }, async () => {
    const originalFetch = globalThis.fetch;
    let buildIdRequests = 0;
    let staleAttempt = false;

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === "https://www.fotmob.com" || url === "https://www.fotmob.com/") {
        buildIdRequests += 1;
        return textResponse(`<html><script>"buildId":"${buildIdRequests === 1 ? "stale" : "fresh"}"</script></html>`);
      }

      if (url.includes("/api/data/match?")) {
        return jsonResponse({
          id: 4813565,
          home: { id: 1, score: 0 },
          away: { id: 2, score: 0 },
          status: { finished: true, utcTime: "2026-01-03T17:30:00.000Z" }
        });
      }

      if (url === "https://www.fotmob.com/_next/data/stale/match/4813565/playbyplay.json") {
        staleAttempt = true;
        return new Response("not found", { status: 404 });
      }

      if (url === "https://www.fotmob.com/_next/data/fresh/match/4813565/playbyplay.json") {
        return jsonResponse({
          pageProps: {
            general: { matchId: "4813565", leagueId: 47, homeTeam: { id: 1 }, awayTeam: { id: 2 } },
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
      assert.ok(staleAttempt, "must try stale buildId first");
      assert.equal(buildIdRequests, 2, "buildId must be refetched after the stale 404");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}
