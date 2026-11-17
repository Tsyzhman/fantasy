/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { syncSportsRuSquadSnapshots } from "./sports_ru_squad_snapshots";
import { fantasySquadTransferBaselineFromFilters, sportsPublicationId } from "./squad_planner";
import type { SportsRuPublishedSquad } from "@/lib/providers/sports-ru-fantasy";

test("late complete Sports tour advances only its bound variant and repeated checks keep the saved draft", { skip: !process.env.DATABASE_URL }, async () => {
  const db = new PrismaClient();
  const leagueId = BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 12));
  const season = "2026/2027", provider = "SPORTS_RU", profile = "wi005-" + randomUUID();
  const kickoff = new Date("2026-11-15T12:00:00Z");
  const now = new Date(+kickoff + 86400000);
  const roles = ["GK","DEF","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD","GK","DEF","MID","FWD"];
  const published: SportsRuPublishedSquad = { providerSquadId: profile, squadName: "QA", tournamentHru: "qa", tournamentName: "QA",
    seasonId: "75", tourId: "202", tourName: "2", totalPrice: 75, currentBalance: 25, tourFinishedAt: null,
    players: roles.map((role, i) => ({ providerPlayerId: String(i+1), name: "QA " + i, teamName: "Team " + i, role, price: 5,
      isStarter: i < 11, isCaptain: i === 0, isViceCaptain: i === 1, substitutePriority: i < 11 ? null : i - 11 })) };
  const user = await db.user.create({ data: { email: profile + "@example.invalid" } });
  try {
    await db.coreLeague.create({ data: { id: leagueId, name: profile, source: "test" } });
    const contest = await db.fantasyContest.create({ data: { provider, leagueId, season, name: "QA", rules: { sportsRuSeasonId: "75" } } });
    await db.userExternalProfile.create({ data: { userId: user.id, provider, providerUserId: profile, profileUrl: "https://www.sports.ru/" } });
    await db.fantasyProviderRound.createMany({ data: [1,2,3].map(ordinal => ({ provider, contestId: contest.id, ordinal,
      providerRoundId: String(200 + ordinal), name: String(ordinal), startsAt: new Date(+kickoff + (ordinal-2)*7*86400000), fetchedAt: now })) });
    const filters = { globalStrategyBinding: { providerSquadId: profile }, transferBaselinePlayerIds: ["old"] };
    const data = { userId: user.id, leagueId, season, provider, contestId: contest.id };
    const bound = await db.userFantasySquad.create({ data: { ...data, name: "Linked", filters } });
    const other = await db.userFantasySquad.create({ data: { ...data, name: "Personal", filters: { transferBaselinePlayerIds: ["own"] } } });
    const prior = await db.sportsRuSquadSnapshot.create({ data: { userId: user.id, leagueId, season, providerProfileId: profile, providerSeasonId: "75",
      roundKey: "sports-ru:tour:1:201", providerTourId: "201", firstMatchAt: new Date(+kickoff-7*86400000), availableAfter: kickoff, status: "COMPLETE" } });
    const run = (when: Date, response: SportsRuPublishedSquad) => syncSportsRuSquadSnapshots(db, [{ leagueId, season, tournamentHru: "qa" }], {
      now: when, fetchPublishedSquad: async () => response
    });
    await run(now, { ...published, tourId: "201" });
    await run(new Date(+now + 20*60000), { ...published, players: published.players.slice(1) });
    assert.deepEqual((await db.userFantasySquad.findUniqueOrThrow({ where: { id: bound.id } })).filters, filters);
    await db.sportsRuSquadSnapshot.updateMany({ where: { leagueId, providerTourId: "202" }, data: { status: "UNAVAILABLE", attemptCount: 8, nextAttemptAt: null } });
    const result = await run(new Date(+now+40*60000), published);
    assert.equal(result.failed, 0);
    assert.equal(result.stored, 1);
    const saved = await db.userFantasySquad.findUniqueOrThrow({ where: { id: bound.id } });
    assert.ok(sportsPublicationId(saved.filters));
    assert.equal((saved.filters as { sportsPublicationTour: string }).sportsPublicationTour, published.tourName);
    assert.equal(fantasySquadTransferBaselineFromFilters(saved.filters)?.length, 15);
    assert.equal((await run(new Date(+now+45*60000), published)).stored, 0);
    assert.deepEqual(await db.userFantasySquad.findUniqueOrThrow({ where: { id: bound.id } }), saved);
    assert.deepEqual((await db.userFantasySquad.findUniqueOrThrow({ where: { id: other.id } })).filters, { transferBaselinePlayerIds: ["own"] });
    assert.equal((await db.sportsRuSquadSnapshot.findUniqueOrThrow({ where: { id: prior.id } })).status, "COMPLETE");
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.fantasyContest.deleteMany({ where: { leagueId } });
    await db.coreLeague.deleteMany({ where: { id: leagueId } });
    await db.$disconnect();
  }
});
