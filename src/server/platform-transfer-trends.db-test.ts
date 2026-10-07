/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#acceptance */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadPlatformTransferTrends } from "./platform-transfer-trends";
import { GET } from "@/app/api/machete/platform-transfers/route";
import { prisma as apiDb } from "@/lib/db";
import { sessionCookieName } from "@/lib/auth-constants";

const databaseUrl = (() => {
  try { return new URL(process.env.DATABASE_URL ?? ""); } catch { return null; }
})();
// Fixtures are allowed only in the disposable local database or the CI common-test database.
const enabled = databaseUrl?.hostname === "127.0.0.1" && (
  (process.env.PLATFORM_TRANSFER_TEST_DATABASE === "true" && databaseUrl.port === "55440"
    && databaseUrl.pathname === "/platform_trends_test")
  || (process.env.CI === "true" && databaseUrl.port === "55439"
    && databaseUrl.pathname === "/fantasy_scout_test_ci")
);
const db = new PrismaClient();
const now = new Date("2026-10-06T12:00:00Z");
const start = new Date("2026-10-05T12:00:00Z");
const next = new Date("2026-10-10T12:00:00Z");
const ids = Array.from({ length: 15 }, (_, i) => String(910000 + i));
const incoming = "910015";
const baseline = ids.map(playerId => ({ playerId }));
const changed = [...ids.slice(0, 14), incoming];
const plans = (selections: string[], roundId = "sports-ru:tour:11:t11") => ({ roundPlanRoundIds: [roundId], roundPlans: [{ roundOffset: 0, selections: selections.map(playerId => ({ playerId })) }] });

after(async () => { await Promise.all([db.$disconnect(), apiDb.$disconnect()]); });

async function footballFixture(provider = "SPORTS_RU", leagueId = 63n) {
  await db.coreLeague.upsert({ where: { id: leagueId }, create: { id: leagueId, name: "Russia Premier League", country: "Russia" }, update: {} });
  await db.corePlayer.createMany({ data: [...ids, incoming].map((id, i) => ({ id: BigInt(id), name: `Test Player ${i + 1}` })), skipDuplicates: true });
  const season = `QA-${randomUUID()}`;
  const contest = await db.fantasyContest.create({ data: { leagueId, provider, season, name: "QA platform transfers" } });
  await db.fantasyProviderRound.createMany({ data: [9, 10, 11].map(ordinal => ({ contestId: contest.id, provider,
    ordinal, providerRoundId: `t${ordinal}`, name: `${ordinal} тур`, startsAt: ordinal === 11 ? next : ordinal === 10 ? start : new Date("2026-09-25"),
    deadlineAt: ordinal === 11 ? next : ordinal === 10 ? start : new Date("2026-09-25"), status: ordinal === 11 ? "NEXT" : "FINISHED", fetchedAt: now })) });
  await db.fantasyPlayerPrice.createMany({ data: [...ids, incoming].map((id, i) => ({ contestId: contest.id, leagueId, season,
    provider, playerId: BigInt(id), providerPlayerId: id, playerName: i === 15 ? "Александр Оченьдлиннаяфамилия" : `Игрок ${i + 1}`,
    normalizedName: `player-${i}`, teamName: "Клуб", position: "MID", price: 5, lastSeenAt: now })) });
  return contest;
}

async function user(label: string, active = true) {
  return db.user.create({ data: { email: `${label}-${randomUUID()}@example.test`, name: `QA ${label}`, isActive: active } });
}

async function sportsBaseline(userId: string, contest: Awaited<ReturnType<typeof footballFixture>>, profileId: string,
  round = 10, selections: unknown = baseline, status = "COMPLETE") {
  return db.sportsRuSquadSnapshot.create({ data: { userId, leagueId: contest.leagueId, season: contest.season,
    providerProfileId: profileId, providerSeasonId: "qa-season", providerTourId: `t${round}`,
    roundKey: `sports-ru:tour:${round}:t${round}`, roundLabel: `${round} тур`, firstMatchAt: start, availableAfter: start,
    status, playersCount: 15, mappedPlayersCount: 15, selections: selections as Prisma.InputJsonValue, completedAt: now } });
}

test("PostgreSQL: latest variants, round/league/profile isolation, exact net changes and read-only repeat", { skip: !enabled }, async () => {
  const contest = await footballFixture();
  for (const [i, label] of ["changed-a", "changed-b", "missing-latest", "incomplete-latest", "unchanged", "inactive"].entries()) {
    const u = await user(label, i !== 5);
    await db.userExternalProfile.create({ data: { userId: u.id, provider: "SPORTS_RU", providerUserId: `profile-${i}`, profileUrl: "https://www.sports.ru/profile/test/" } });
    await sportsBaseline(u.id, contest, `profile-${i}`, i === 2 ? 9 : 10);
    if (i === 1) await sportsBaseline(u.id, contest, "old-profile", 10, changed.map(playerId => ({ playerId })));
    if (i === 3 || i === 0) await db.userFantasySquad.create({ data: { userId: u.id, contestId: contest.id, provider: "SPORTS_RU", leagueId: contest.leagueId, season: contest.season,
      name: "Older variant", filters: plans(ids), updatedAt: start } });
    const selected = i === 3 ? changed.slice(0, 14) : i === 4 ? ids : changed;
    await db.userFantasySquad.create({ data: { userId: u.id, contestId: contest.id, provider: "SPORTS_RU", leagueId: contest.leagueId, season: contest.season,
      name: "Latest variant", filters: plans(selected), updatedAt: now } });
  }
  const before = await db.sportsRuSquadSnapshot.count();
  const input = { contestId: contest.id, module: "football" as const, now };
  const view = await loadPlatformTransferTrends(db, input);
  assert.equal(view?.status, "READY");
  assert.deepEqual([view?.participants, view?.compared, view?.excluded], [5, 3, 2]);
  assert.deepEqual(view?.buys.map(e => [e.playerId, e.count, e.percent]), [[incoming, 2, 200 / 3]]);
  assert.deepEqual(view?.sells.map(e => [e.playerId, e.count]), [[ids[14], 2]]);
  assert.equal(view?.baselineRound?.label, "10 тур");
  assert.equal(view?.targetRound?.label, "11 тур");
  assert.deepEqual(await loadPlatformTransferTrends(db, input), view);
  assert.equal(await db.sportsRuSquadSnapshot.count(), before);
  await db.fantasyProviderRound.updateMany({ where: { contestId: contest.id, ordinal: 11 }, data: { deadlineAt: start, startsAt: start } });
  assert.equal((await loadPlatformTransferTrends(db, input))?.status, "NO_NEXT_ROUND");
  await db.fantasyProviderRound.updateMany({ where: { contestId: contest.id }, data: { deadlineAt: next, startsAt: next } });
  assert.equal((await loadPlatformTransferTrends(db, input))?.status, "NO_BASELINE");
});

test("PostgreSQL: FPL uses completed round and linked entry, never Sports popularity", { skip: !enabled }, async () => {
  const contest = await footballFixture("FPL", 47n);
  const u = await user("fpl");
  await db.userExternalProfile.create({ data: { userId: u.id, provider: "FPL", providerUserId: "777", profileUrl: "https://fantasy.premierleague.com/entry/777/" } });
  await db.userFantasySquad.create({ data: { userId: u.id, contestId: contest.id, provider: "FPL", leagueId: contest.leagueId, season: contest.season,
    name: "FPL plan", filters: plans(changed, "fpl:event:11"), updatedAt: now } });
  for (const entry of ["777", "old-entry"]) await db.fantasyProviderSquadSnapshot.create({ data: { userId: u.id, contestId: contest.id, provider: "FPL", leagueId: contest.leagueId,
    season: contest.season, gameweek: 10, providerSquadId: entry, status: "IMPORTED", playersCount: 15, mappedPlayersCount: 15,
    importedAt: now, selections: (entry === "777" ? baseline : changed.map(playerId => ({ playerId }))) } });
  const view = await loadPlatformTransferTrends(db, { contestId: contest.id, module: "football", now });
  assert.equal(view?.provider, "FPL");
  assert.equal(view?.buys[0].count, 1);
  assert.equal(view?.sells[0].playerId, ids[14]);
  await db.fantasyProviderRound.updateMany({ where: { contestId: contest.id, ordinal: 10 }, data: { status: "CURRENT" } });
  assert.equal((await loadPlatformTransferTrends(db, { contestId: contest.id, module: "football", now }))?.status, "NO_COMPARABLE_SQUADS");
});

test("PostgreSQL: cursor batches count 101 users once each", { skip: !enabled }, async (t) => {
  const contest = await footballFixture();
  const prefix = randomUUID();
  const userIds = Array.from({ length: 101 }, (_, i) => `${prefix}-${String(i).padStart(3, "0")}`);
  await db.user.createMany({ data: userIds.map(id => ({ id, email: `${id}@example.test` })) });
  await db.userExternalProfile.createMany({ data: userIds.map(id => ({ userId: id, provider: "SPORTS_RU", providerUserId: id, profileUrl: "https://www.sports.ru/profile/test/" })) });
  await db.userFantasySquad.createMany({ data: userIds.flatMap(userId => ["a", "b"].map(name => ({ userId, contestId: contest.id, provider: "SPORTS_RU", leagueId: contest.leagueId,
    season: contest.season, name, updatedAt: name === "a" ? start : now, filters: plans(name === "a" ? ids : changed) }))) });
  await db.sportsRuSquadSnapshot.createMany({ data: userIds.map(userId => ({ userId, leagueId: contest.leagueId, season: contest.season,
    providerProfileId: userId, providerSeasonId: "qa-season", providerTourId: "t10", roundKey: "sports-ru:tour:10:t10", firstMatchAt: start, availableAfter: start,
    status: "COMPLETE", playersCount: 15, mappedPlayersCount: 15, selections: baseline, completedAt: now })) });
  const started = performance.now();
  const view = await loadPlatformTransferTrends(db, { contestId: contest.id, module: "football", now });
  assert.equal(view?.participants, 101);
  assert.equal(view?.compared, 101);
  assert.equal(view?.buys[0].count, 101);
  assert.equal(view?.buys[0].percent, 100);
  t.diagnostic(`101 users / 202 variants: ${Math.round(performance.now() - started)} ms; RSS ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MiB`);
});

test("PostgreSQL and API: isolated KHL snapshots, no personal data, session and feature gates", { skip: !enabled }, async () => {
  const competition = await db.khlCompetition.create({ data: { code: randomUUID() } });
  const season = await db.khlSeason.create({ data: { competitionId: competition.id, seasonKey: "2026/2027", label: "QA" } });
  const contest = await db.khlContest.create({ data: { seasonId: season.id, providerContestId: randomUUID(), name: "КХЛ QA" } });
  const u = await user("khl");
  await db.khlFantasyWeek.create({ data: { contestId: contest.id, providerWeekId: "10", label: "10 неделя", startsAt: start, endsAt: next, timezone: "Europe/Moscow", verified: true, sourceUrl: "test://fixture" } });
  const players = Array.from({ length: 18 }, (_, i) => ({ id: `${contest.id}-${i}`, contestId: contest.id, providerPlayerId: String(i),
    name: `Хоккеист ${i + 1}`, clubId: String(i % 6), clubName: "Клуб КХЛ", position: i < 2 ? "G" : i < 8 ? "D" : "F", currentPriceUnits: 500, observedAt: now }));
  await db.khlFantasyPlayer.createMany({ data: players });
  const snapshot = await db.khlProviderSquadSnapshot.create({ data: { userId: u.id, contestId: contest.id, providerEntryId: "team-1", providerWeekId: "10",
    bankUnits: 500, entries: players.slice(0, 17).map(p => p.id), source: "test://fixture", observedAt: now, hash: randomUUID() } });
  const squad = await db.khlUserSquad.create({ data: { userId: u.id, contestId: contest.id, name: "QA latest", baselineSnapshotId: snapshot.id, updatedAt: now } });
  await db.khlUserSquadEntry.createMany({ data: [...players.slice(0, 16), players[17]].map((p, slotIndex) => ({ squadId: squad.id, contestId: contest.id, fantasyPlayerId: p.id, slotIndex })) });
  const view = await loadPlatformTransferTrends(db, { contestId: contest.id, module: "khl", now });
  assert.equal(view?.compared, 1);
  assert.equal(view?.buys[0].playerId, players[17].id);
  assert.equal(view?.sells[0].playerId, players[16].id);
  const token = randomUUID();
  await db.userSession.create({ data: { userId: u.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) } });
  const request = (query: string, authenticated = true) => new Request(`http://localhost/api/machete/platform-transfers?${query}`, { headers: authenticated ? { cookie: `${sessionCookieName}=${token}` } : {} });
  assert.equal((await GET(request("module=invalid"))).status, 400);
  assert.equal((await GET(request(`contestId=${contest.id}`, false))).status, 401);
  assert.equal((await GET(request("contestId=missing"))).status, 404);
  const previousFlag = process.env.KHL_ENABLED;
  try {
    process.env.KHL_ENABLED = "false";
    assert.equal((await GET(request(`contestId=${contest.id}&module=khl`))).status, 404);
    process.env.KHL_ENABLED = "true";
    const response = await GET(request(`contestId=${contest.id}&module=khl`));
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.contestId, contest.id);
    assert.ok(!JSON.stringify(body).includes(u.id));
    assert.ok(!JSON.stringify(body).includes(u.email));
  } finally {
    if (previousFlag === undefined) delete process.env.KHL_ENABLED; else process.env.KHL_ENABLED = previousFlag;
  }
});
