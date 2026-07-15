import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { syncMacheteLeagueMetadata } from "./sync-league";

test("metadata sync discovers the provider's current season instead of pinning the stored season", async () => {
  const requests: Array<{ leagueId: string; season: string | undefined }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const existingLeague = {
    id: "league-1",
    provider: "FOTMOB",
    providerLeagueId: "47",
    name: "Premier League",
    country: "England",
    season: "2025/2026",
    logoUrl: null,
    status: "SYNCED",
    lastSyncedAt: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z")
  };
  const prisma = {
    macheteLeague: {
      findUnique: async () => existingLeague,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...existingLeague, ...data };
      }
    }
  } as unknown as PrismaClient;

  const result = await syncMacheteLeagueMetadata(prisma, existingLeague.id, {
    client: {
      getLeague: async (leagueId, season) => {
        requests.push({ leagueId, season });
        return {
          id: "47",
          name: "Premier League",
          country: "England",
          season: "2026/2027"
        };
      }
    },
    storeRawPayload: async () => null
  });

  assert.deepEqual(requests, [{ leagueId: "47", season: undefined }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.season, "2026/2027");
  assert.equal(result.season, "2026/2027");
});
