/** @spec spec://modules/khl/FEAT-002-khl-squad#sports-import */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { importSportsHockeySquad } from "@/server/khl/sports-import";
import type { SportsHockeySquad } from "@/providers/sports-ru-hockey/squad";
const db = new PrismaClient();
const enabled = process.env.KHL_TEST_DATABASE === "true" && Boolean(process.env.DATABASE_URL?.match(/127\.0\.0\.1:(55439|45439)\/khl_test/));
after(() => db.$disconnect());
test("Sports import is owned, atomic, deduplicated, rate-limited and bounded", { skip: !enabled }, async () => {
  const key = randomUUID();
  const user = await db.user.create({ data: { email: `sports-khl-${key}@example.test`, franchise: "MACHETE" } });
  const competition = await db.khlCompetition.create({ data: { code: key } });
  const season = await db.khlSeason.create({ data: { competitionId: competition.id, seasonKey: key, label: "Test" } });
  const contest = await db.khlContest.create({ data: { seasonId: season.id, providerContestId: "107", name: "Test" } });
  const oldContract = await db.khlSourceContract.findUnique({ where: { provider: "SPORTS_RU_TEAM" } });
  const subject = createHash("sha256").update(user.id).digest("hex");
  const resetRate = () => db.authRateLimit.deleteMany({ where: { action: "KHL_SPORTS_IMPORT", subjectHash: subject } });
  const source: SportsHockeySquad = { teamId: "42", name: "Test team", week: "1", bank: 0, totalPrice: 17000, source: "https://www.sports.ru/fantasy/hockey/team/42.html", players: Array.from({ length: 17 }, (_, i) => ({ id: String(i + 1), price: 1000, position: i < 2 ? "G" : i < 8 ? "D" : "F" })) };
  let calls = 0;
  const fetchSource = async () => { calls++; return source; };
  try {
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, {}, fetchSource), /Привяжите/);
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, { squadId: "foreign", expectedVersion: 1 }, fetchSource), /не найден/);
    assert.equal(calls, 0);
    await db.userExternalProfile.create({ data: { userId: user.id, provider: "SPORTS_RU", providerUserId: "123", profileUrl: "https://www.sports.ru/profile/123/" } });
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, {}, fetchSource), /Не все 17/);
    assert.equal(await db.khlUserSquad.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.khlProviderSquadSnapshot.count({ where: { userId: user.id } }), 0);
    await db.khlFantasyPlayer.createMany({ data: source.players.map((p, i) => ({ contestId: contest.id, providerPlayerId: p.id, name: `Player ${i}`, clubId: `club${i % 7}`, clubName: "Club", position: p.position, currentPriceUnits: p.price, observedAt: new Date() })) });
    await resetRate();
    const first = await importSportsHockeySquad(db, user.id, contest.id, {}, fetchSource);
    assert.equal(first.squad.entries.length, 17); assert.equal(first.squad.bankUnits, 0); assert.equal(first.externalExecuted, false);
    const second = await importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: first.squad.revision }, fetchSource);
    assert.equal(second.squad.revision, 2);
    assert.equal(await db.khlProviderSquadSnapshot.count({ where: { userId: user.id } }), 1);
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: 2 }, fetchSource), /дважды/);
    await resetRate();
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: 1 }, fetchSource), /изменился/);
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: 2 }, async () => { throw new Error("Source offline"); }), /Source offline/);
    assert.equal(await db.khlUserSquadEntry.count({ where: { squadId: first.squad.id } }), 17);
    await assert.rejects(importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: 2 }, async () => {
      await db.khlUserSquad.update({ where: { id: first.squad.id }, data: { revision: { increment: 1 }, name: "Concurrent edit" } });
      return { ...source, bank: 1 };
    }), /изменился/);
    assert.equal(await db.khlProviderSquadSnapshot.count({ where: { userId: user.id } }), 1);
    assert.equal((await db.khlUserSquad.findUniqueOrThrow({ where: { id: first.squad.id } })).name, "Concurrent edit");
    for (let i = 0; i < 5; i++) {
      await resetRate();
      await importSportsHockeySquad(db, user.id, contest.id, { squadId: first.squad.id, expectedVersion: 3 + i }, async () => ({ ...source, bank: i + 1 }));
    }
    assert.equal(await db.khlProviderSquadSnapshot.count({ where: { userId: user.id } }), 3);
    assert.equal(await db.khlUserSquadEntry.count({ where: { squadId: first.squad.id } }), 17);
  } finally {
    await db.khlUserSquadEntry.deleteMany({ where: { squad: { userId: user.id } } });
    await db.khlUserSquad.deleteMany({ where: { userId: user.id } });
    await db.khlProviderSquadSnapshot.deleteMany({ where: { userId: user.id } });
    await db.khlFantasyPlayer.deleteMany({ where: { contestId: contest.id } });
    await db.khlContest.delete({ where: { id: contest.id } });
    await db.khlSeason.delete({ where: { id: season.id } });
    await db.khlCompetition.delete({ where: { id: competition.id } });
    await resetRate(); await db.user.delete({ where: { id: user.id } });
    if (oldContract) await db.khlSourceContract.update({ where: { provider: "SPORTS_RU_TEAM" }, data: { ...oldContract, capabilities: oldContract.capabilities as Prisma.InputJsonValue, coverage: oldContract.coverage as Prisma.InputJsonValue } });
    else await db.khlSourceContract.deleteMany({ where: { provider: "SPORTS_RU_TEAM" } });
  }
});
