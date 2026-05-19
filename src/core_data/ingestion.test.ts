import assert from "node:assert/strict";
import test from "node:test";

import type { FotMobClient } from "./fotmob_client";
import { discover_matches_for_scope } from "./ingestion";
import { createIngestionScope } from "./ingestion-scope";
import { ScopeTooBroadError } from "./scope-validation";

test("scope discovery uses league-season fixtures only and does not load team history", async () => {
  const calls: string[] = [];
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      calls.push("getTeams");
      throw new Error("team history discovery is forbidden");
    },
    async getFixtures(leagueId, season) {
      calls.push(`getFixtures:${leagueId}:${season}`);
      return [
        {
          id: "1",
          leagueId,
          homeTeamId: "10",
          awayTeamId: "20",
          kickoffAt: "2023-08-01T12:00:00.000Z",
          status: "FINISHED",
          homeScore: 1,
          awayScore: 0
        }
      ];
    },
    async getFixtureDetails() {
      throw new Error("detail fetching should happen after discovery validation");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  const matches = await discover_matches_for_scope(client, createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 }));

  assert.equal(matches.length, 1);
  assert.deepEqual(calls, ["getFixtures:47:2023/2024"]);
});

test("scope validation blocks before matchDetails fetching", async () => {
  let detailsFetched = false;
  const client: FotMobClient = {
    async getLeague() {
      throw new Error("not used");
    },
    async getTeams() {
      throw new Error("not used");
    },
    async getFixtures(leagueId) {
      return Array.from({ length: 701 }, (_, index) => ({
        id: String(index + 1),
        leagueId,
        homeTeamId: "10",
        awayTeamId: "20",
        kickoffAt: "2023-08-01T12:00:00.000Z",
        status: "FINISHED" as const,
        homeScore: 1,
        awayScore: 0
      }));
    },
    async getFixtureDetails() {
      detailsFetched = true;
      throw new Error("should not fetch details");
    },
    async getPlayer() {
      throw new Error("not used");
    }
  };

  await assert.rejects(
    discover_matches_for_scope(client, createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 })),
    ScopeTooBroadError
  );
  assert.equal(detailsFetched, false);
});

