import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveSportsRuTeamCandidate,
  sportsRuContestRules,
  syncSportsRuFantasy
} from "./sports_ru_fantasy_sync";

test("Sports.ru sync preserves the database when the current season is unavailable", async () => {
  let databaseReads = 0;
  const prisma = new Proxy(
    {},
    {
      get() {
        databaseReads += 1;
        throw new Error("database must not be touched");
      }
    }
  );

  const result = await syncSportsRuFantasy(prisma as never, {
    leagueId: 47n,
    season: "2026/2027",
    tournamentHru: "england",
    fetchImpl: sportsRuFetch(null, 0)
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.databaseChanged, false);
  assert.equal(databaseReads, 0);
});

test("Sports.ru dry run validates a full current-season snapshot without database writes", async () => {
  const result = await syncSportsRuFantasy({} as never, {
    leagueId: 47n,
    season: "2026/2027",
    tournamentHru: "england",
    dryRun: true,
    fetchImpl: sportsRuFetch("season-1", 25)
  });

  assert.equal(result.status, "READY");
  assert.equal(result.prices, 100);
  assert.equal(result.databaseChanged, false);
});

test("Sports.ru sync rejects an implausibly small current-season snapshot before database writes", async () => {
  await assert.rejects(
    syncSportsRuFantasy({} as never, {
      leagueId: 47n,
      season: "2026/2027",
      tournamentHru: "england",
      fetchImpl: sportsRuFetch("season-1", 24)
    }),
    /returned only 96 current-season prices.*required at least 100/
  );
});

test("routine price refreshes send only previously unmapped rows to identity matching", () => {
  const source = readFileSync(new URL("./sports_ru_fantasy_sync.ts", import.meta.url), "utf8");
  assert.match(source, /autoMapSportsRuFantasyPlayers\(prisma,[\s\S]*onlyUnmapped: true/);
  assert.doesNotMatch(source, /autoMapSportsRuFantasyPlayers\(prisma, \{ leagueId: input\.leagueId, season: input\.season \}\)/);
});

test("Sports.ru contest rules preserve phase history and continue cup round offsets", () => {
  const group = sportsRuContestRules(null, sportsSnapshot("70", 8), "champions-league");
  const playoffs = sportsRuContestRules(group, sportsSnapshot("72", 9), "champions-league");
  assert.deepEqual((playoffs.sportsRuSeasons as Array<{ seasonId: string; canonicalOffset: number }>).map((phase) => [
    phase.seasonId,
    phase.canonicalOffset
  ]), [["70", 0], ["72", 8]]);

  const transientEmptyTours = sportsRuContestRules(playoffs, sportsSnapshot("72", 0), "champions-league");
  const current = (transientEmptyTours.sportsRuSeasons as Array<{ seasonId: string; tours: unknown[] }>).find((phase) => phase.seasonId === "72");
  assert.equal(current?.tours.length, 9);
  assert.equal(Object.hasOwn(current?.tours[0] as object, "fixtures"), false, "fixture payloads must stay in normalized tables, not contest JSON");
});

test("Sports.ru schedule team mapping tolerates isolated stale player-team assignments", () => {
  assert.deepEqual(resolveSportsRuTeamCandidate(new Map([[8302n, 29], [8633n, 1], [9906n, 1]])), {
    internalTeamId: 8302n,
    confidence: 29 / 31,
    matchedBy: "SPORTS_RU_PRICE_TEAM_DOMINANCE"
  });
  assert.equal(resolveSportsRuTeamCandidate(new Map([[8302n, 5], [8633n, 4]])), null);
  assert.deepEqual(resolveSportsRuTeamCandidate(new Map([[8302n, 1]])), {
    internalTeamId: 8302n,
    confidence: 1,
    matchedBy: "SPORTS_RU_PRICE_TEAM_CONSENSUS"
  });
});

function sportsRuFetch(seasonId: string | null, playersPerRole: number): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (!url.includes("/gql/graphql/")) return new Response("<html><h1>Fantasy</h1></html>", { status: 200 });

    const query = String(init?.body ? JSON.parse(String(init.body)).query : "");
    if (query.includes("currentSeason")) {
      return Response.json({ data: { fantasyQueries: { tournament: { currentSeason: seasonId ? { id: seasonId } : null } } } });
    }
    const role = /role:\s*(GOALKEEPER|DEFENDER|MIDFIELDER|FORWARD)/.exec(query)?.[1] ?? "UNKNOWN";
    const list = Array.from({ length: playersPerRole }, (_, index) => ({
      id: `${role}-${index}`,
      name: `${role} Player ${index}`,
      price: 5 + index / 10,
      statObject: { lastName: `Player ${index}` }
    }));
    return Response.json({ data: { fantasyQueries: { players: { list } } } });
  };
}

function sportsSnapshot(seasonId: string, tourCount: number) {
  return {
    tournamentHru: "champions-league",
    seasonId,
    tours: Array.from({ length: tourCount }, (_, index) => ({
      id: `${seasonId}-${index + 1}`,
      name: `${index + 1} тур`,
      status: null,
      startedAt: null,
      finishedAt: null,
      fixtures: []
    })),
    prices: [],
    fetchedAt: "2026-08-09T00:00:00.000Z"
  };
}
