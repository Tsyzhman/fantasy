/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { loadSquadFoontasyUpdate, squadFoontasyRound, withSquadFoontasyForecasts } from "./squad-foontasy";
import { applySquadFoontasyUpdate } from "./squad-player-dto";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

test("FFO matches the provider tour and its phase even when the ordinal restarts", () => {
  const league = { leagueId: 42n, season: "2026/2027" };
  const rules = {
    sportsRuSeasonId: "playoffs",
    sportsRuSeasons: [
      { seasonId: "league", canonicalOffset: 0, tours: [{ id: "old-1", name: "1 tour" }] },
      { seasonId: "playoffs", canonicalOffset: 8, tours: [{ id: "playoffs:1", name: "1 tour" }] }
    ]
  };
  assert.deepEqual(squadFoontasyRound(league, rules, "sports-ru:tour:1:playoffs%3A1"), {
    ...league, sourceSeasonId: "playoffs", sourceRoundNumber: 1, roundNumber: 9
  });
  for (const key of ["sports-ru:tour:1:old-1", "sports-ru:tour:1:%", "round:1", "fpl:event:1", undefined]) {
    assert.equal(squadFoontasyRound(league, rules, key), null);
  }
});

test("a retained pool reads the latest exact-tour batch and open tabs receive the same update", { skip }, async () => {
  const leagueId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 14)}`);
  const [mijnans, zero, removed] = [leagueId + 1n, leagueId + 2n, leagueId + 3n];
  const firstBatch = new Date("2026-11-06T10:00:00Z");
  const secondBatch = new Date("2026-11-06T12:01:20Z");
  const unrelatedFetch = new Date("2026-11-06T12:02:00Z");
  const round = { leagueId, season: "2026/2027", sourceSeasonId: "76", sourceRoundNumber: 12, roundNumber: 12 };

  const entry = (
    playerId: bigint, points: number, fetchedAt: Date, extra: Partial<Prisma.FoontasyForecastCreateManyInput> = {}
  ): Prisma.FoontasyForecastCreateManyInput => ({
    ...round, sourceVariant: "sports", sourcePlayerId: String(playerId), playerId, playerName: String(playerId),
    teamName: "PSV", points, fetchedAt, updatedAt: fetchedAt, ...extra
  });
  const snapshotPlayers = [
    Object.freeze({ playerId: String(mijnans), foontasyPoints: 9.62, predictedFp: 5.25 }),
    Object.freeze({ playerId: String(zero), foontasyPoints: null, predictedFp: 1.2 }),
    Object.freeze({ playerId: String(removed), foontasyPoints: 2, predictedFp: 3.41 })
  ];

  await prisma.coreLeague.create({ data: { id: leagueId, name: "FFO verification", source: "test" } });
  try {
    await prisma.corePlayer.createMany({
      data: [mijnans, zero, removed].map((id) => ({ id, name: String(id), source: "test" }))
    });
    await prisma.foontasyForecast.createMany({ data: [
      entry(mijnans, 9.62, firstBatch, { sourceRoundNumber: 11, roundNumber: 11 }),
      entry(mijnans, 99, unrelatedFetch, { sourceSeasonId: "other-phase" }),
      entry(mijnans, 88, unrelatedFetch, { sourceVariant: "uefa" }),
      entry(mijnans, 77, unrelatedFetch, { season: "2025/2026" })
    ] });
    const unavailable = await withSquadFoontasyForecasts(prisma, snapshotPlayers, round);
    assert.deepEqual(unavailable.map((player) => player.foontasyPoints), [null, null, null]);
    assert.deepEqual(await loadSquadFoontasyUpdate(prisma, round, null), { revision: "", pointsByPlayerId: {} });
    assert.equal(await loadSquadFoontasyUpdate(prisma, round, ""), undefined);

    await prisma.foontasyForecast.createMany({ data: [
      entry(mijnans, 6.7, firstBatch),
      entry(removed, 2, firstBatch)
    ] });
    const loaded = await withSquadFoontasyForecasts(prisma, snapshotPlayers, round);
    assert.deepEqual(loaded.map((player) => player.foontasyPoints), [6.7, null, 2]);

    await prisma.$transaction([
      prisma.foontasyForecast.updateMany({
        where: { ...round, sourceVariant: "sports", sourcePlayerId: String(mijnans) },
        data: { points: 7.4, fetchedAt: secondBatch, updatedAt: secondBatch }
      }),
      prisma.foontasyForecast.createMany({ data: [
        entry(zero, 0, secondBatch),
        entry(mijnans, 6.99, secondBatch, { sourcePlayerId: "alias", updatedAt: firstBatch })
      ] })
    ]);
    const update = await loadSquadFoontasyUpdate(prisma, round, firstBatch.toISOString());
    assert.deepEqual(update, {
      revision: secondBatch.toISOString(),
      pointsByPlayerId: { [String(mijnans)]: 7.4, [String(zero)]: 0 }
    });
    const refreshed = await withSquadFoontasyForecasts(prisma, snapshotPlayers, round);
    assert.deepEqual(applySquadFoontasyUpdate(loaded, update!), refreshed);
    assert.deepEqual(refreshed.map((player) => player.foontasyPoints), [7.4, 0, null]);
    assert.deepEqual(refreshed.map((player) => player.predictedFp), [5.25, 1.2, 3.41]);
    assert.equal(snapshotPlayers[0].foontasyPoints, 9.62);
    assert.strictEqual(applySquadFoontasyUpdate(refreshed, update!), refreshed);
    assert.equal(await loadSquadFoontasyUpdate(prisma, round, secondBatch.toISOString()), undefined);
  } finally {
    await prisma.coreLeague.delete({ where: { id: leagueId } });
    await prisma.corePlayer.deleteMany({ where: { id: { in: [mijnans, zero, removed] } } });
  }
});
