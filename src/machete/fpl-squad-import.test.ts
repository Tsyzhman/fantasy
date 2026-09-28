/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma, PrismaClient } from "@prisma/client";

import { FplPublicClient, parseFplBootstrap, parseFplPublishedPicks } from "@/lib/providers/fpl";

import { FplSquadImportError, importPublishedFplSquad } from "./fpl-squad-import";

function importFixture() {
  const positions = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "DEF", "FWD"];
  const prices = positions.map((position, index) => ({
    providerPlayerId: String(index + 1),
    playerId: BigInt(index + 101),
    teamId: BigInt(Math.floor(index / 3) + 201),
    position,
    price: 6
  }));
  const roster = prices.map((row, index) => ({
    playerId: row.playerId,
    teamId: row.teamId,
    active: true,
    position: index === 4 ? "RW" : index === 5 ? "LW" : row.position
  }));
  const bootstrap = parseFplBootstrap({
    events: [{ id: 5, name: "Gameweek 5", deadline_time: "2026-09-25T17:30:00Z", finished: true, is_previous: true, released: true, data_checked: true }],
    teams: [{ id: 1, name: "Arsenal", short_name: "ARS", code: 3 }],
    elements: [{ id: 1, code: 10001, team: 1, element_type: 1, web_name: "Keeper", first_name: "Test", second_name: "Keeper", now_cost: 60 }],
    element_types: [{ id: 1, singular_name_short: "GKP", squad_select: 2, squad_min_play: 1, squad_max_play: 1 }],
    chips: [],
    game_config: {}
  });
  const published = parseFplPublishedPicks({
    picks: prices.map((row, index) => ({
      element: Number(row.providerPlayerId),
      position: index + 1,
      is_captain: index === 9,
      is_vice_captain: index === 4,
      multiplier: index > 10 ? 0 : index === 9 ? 2 : 1,
      purchase_price: 60
    })),
    entry_history: { bank: 100, value: 900, event_transfers: 0, event_transfers_cost: 0, points: 56 }
  }, 5);
  const client = {
    getBootstrap: async () => bootstrap,
    getPublishedPicks: async () => published
  } as unknown as FplPublicClient;

  let transactionCalls = 0;
  let writtenPlayers: Prisma.UserFantasySquadPlayerCreateManyInput[] = [];
  const tx = {
    fantasyChipUsage: { findMany: async () => [] },
    fantasyChipDefinition: { findMany: async () => [] },
    fantasyUserGameweekState: { findFirst: async () => null, upsert: async () => ({}) },
    userFantasySquad: { findFirst: async () => null, create: async () => ({ id: "squad", name: "FPL GW5", horizonRounds: 5 }) },
    userFantasySquadPlayer: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: Prisma.UserFantasySquadPlayerCreateManyInput[] }) => {
        writtenPlayers = data;
        return { count: data.length };
      }
    },
    fantasyProviderSquadSnapshot: { upsert: async () => ({ id: "snapshot" }) },
    userExternalProfile: { update: async () => ({}) }
  };
  const prisma = {
    fantasyContest: { findUnique: async () => ({ id: "contest" }) },
    fantasyPlayerPrice: { findMany: async () => prices },
    teamPlayerSeason: { findMany: async () => roster.filter((row) => row.active) },
    $transaction: async <T>(work: (client: typeof tx) => Promise<T>) => {
      transactionCalls += 1;
      return work(tx);
    }
  } as unknown as PrismaClient;

  return {
    prisma, client, prices, roster,
    input: { userId: "user", entryId: "123", now: new Date("2026-09-28T14:00:00Z"), client },
    writtenPlayers: () => writtenPlayers,
    transactionCalls: () => transactionCalls
  };
}

test("published FPL import accepts active wingers while preserving FPL midfield positions and lineup", async () => {
  const fixture = importFixture();
  const before = structuredClone(fixture.roster);
  const result = await importPublishedFplSquad(fixture.prisma, fixture.input);

  assert.equal(result.selections.length, 15);
  assert.equal(result.selections.filter((row) => row.isStarter).length, 11);
  assert.equal(result.selections.find((row) => row.isCaptain)?.playerId, "110");
  assert.equal(result.selections.find((row) => row.isViceCaptain)?.playerId, "105");
  assert.equal(fixture.writtenPlayers()[4].position, "MID");
  assert.equal(fixture.writtenPlayers()[5].position, "MID");
  assert.deepEqual(fixture.writtenPlayers().map((row) => row.position), fixture.prices.map((row) => row.position));
  assert.deepEqual(fixture.roster, before);
});

for (const invalidMembership of ["inactive", "different club"] as const) {
  test(`published FPL import rejects invalid ${invalidMembership} roster membership before writes`, async () => {
    const fixture = importFixture();
    if (invalidMembership === "inactive") fixture.roster[4].active = false;
    else fixture.roster[4].teamId = 999n;

    await assert.rejects(importPublishedFplSquad(fixture.prisma, fixture.input), (error: unknown) => {
      assert.ok(error instanceof FplSquadImportError);
      assert.equal(error.code, "FPL_PLAYERS_NOT_ACTIVE");
      assert.deepEqual(error.details, { providerPlayerIds: ["5"] });
      return true;
    });
    assert.equal(fixture.transactionCalls(), 0);
    assert.deepEqual(fixture.writtenPlayers(), []);
  });
}
