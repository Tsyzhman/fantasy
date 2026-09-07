import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { publishBaseline } from "../src/server/khl/forecast-publication";
const db = new PrismaClient();
async function main() {
  if (process.env.KHL_TEST_DATABASE !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1:55439/khl_test")) throw new Error("Local dedicated test DB only");
  const user = await db.user.upsert({ where: { email: "khl-browser@example.test" }, create: { email: "khl-browser@example.test", role: "USER", franchise: "MACHETE" }, update: {} });
  const token = randomUUID();
  await db.userSession.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await db.khlCompetition.upsert({ where: { id: "khl-e2e" }, create: { id: "khl-e2e", code: "KHL-E2E" }, update: {} });
  await db.khlSeason.upsert({ where: { id: "khl-e2e" }, create: { id: "khl-e2e", competitionId: "khl-e2e", seasonKey: "test", label: "TEST FIXTURES" }, update: {} });
  await db.khlContest.upsert({ where: { id: "khl-e2e" }, create: { id: "khl-e2e", seasonId: "khl-e2e", providerContestId: "TEST", name: "Synthetic UI fixtures" }, update: {} });
  for (let i = 0; i < 20; i++) await db.khlFantasyPlayer.upsert({ where: { id: `khl-e2e-${i}` }, create: { id: `khl-e2e-${i}`, contestId: "khl-e2e", providerPlayerId: String(i), name: `Тестовый игрок ${i}`, clubId: `club-${i % 7}`, clubName: `Клуб ${i % 7}`, position: i < 2 ? "G" : i < 8 ? "D" : "F", currentPriceUnits: 500, observedAt: new Date(), providerLock: i === 0 }, update: {} });
  const now = new Date(), from = new Date(now.getTime() - 3600000), to = new Date(now.getTime() + 7 * 86400000);
  await db.khlContest.update({ where: { id: "khl-e2e" }, data: { catalogComplete: true, calendarComplete: true, calendarFrom: from, calendarTo: to, calendarObservedAt: now } });
  await db.khlFantasyWeek.upsert({ where: { id: "khl-e2e-week" }, create: { id: "khl-e2e-week", contestId: "khl-e2e", providerWeekId: "TEST-1", label: "Тестовая неделя", sourceUrl: "TEST_FIXTURE", verified: true, startsAt: from, endsAt: to, timezone: "Europe/Moscow" }, update: { startsAt: from, endsAt: to } });
  for (let i = 0; i < 8; i++) await db.khlTeam.upsert({ where: { id: `khl-e2e-team-${i}` }, create: { id: `khl-e2e-team-${i}`, name: `Клуб ${i}` }, update: {} });
  for (let i = 0; i < 7; i++) for (const future of [false, true]) {
    const id = `khl-e2e-match-${i}-${future}`;
    const startsAt = new Date(now.getTime() + (future ? 1 : -1) * 86400000);
    await db.khlMatch.upsert({ where: { id }, create: { id, seasonId: "khl-e2e", homeId: `khl-e2e-team-${i}`, awayId: "khl-e2e-team-7", startsAt, status: future ? "SCHEDULED" : "FINAL" }, update: { startsAt } });
    if (future) await db.khlMatchFantasyWeek.upsert({ where: { contestId_matchId: { contestId: "khl-e2e", matchId: id } }, create: { contestId: "khl-e2e", matchId: id, weekId: "khl-e2e-week" }, update: {} });
  }
  for (let i = 0; i < 20; i++) {
    const id = `khl-e2e-canonical-${i}`;
    await db.khlPlayer.upsert({ where: { id }, create: { id, name: `Тестовый игрок ${i}` }, update: {} });
    await db.khlFantasyPlayer.update({ where: { id: `khl-e2e-${i}` }, data: { playerId: id, providerLock: false, observedAt: now } });
    await db.khlRosterMembership.upsert({ where: { id }, create: { id, playerId: id, seasonId: "khl-e2e", teamId: `khl-e2e-team-${i % 7}`, startsAt: new Date("2020-01-01Z"), source: "TEST_FIXTURE", observedAt: now }, update: {} });
    await db.khlOfficialFantasyScore.upsert({ where: { fantasyPlayerId_matchId: { fantasyPlayerId: `khl-e2e-${i}`, matchId: `khl-e2e-match-${i % 7}-false` } }, create: { contestId: "khl-e2e", fantasyPlayerId: `khl-e2e-${i}`, matchId: `khl-e2e-match-${i % 7}-false`, points: 10 + i, source: "TEST_FIXTURE", revision: 1, observedAt: now, availableAt: now }, update: { observedAt: now, availableAt: now } });
  }
  await publishBaseline(db, "khl-e2e", "khl-e2e-week", now);
  await mkdir("output/playwright-auth", { recursive: true });
  await writeFile("output/playwright-auth/khl-local.json", JSON.stringify({ cookies: [{ name: "fantasy_session", value: token, domain: "127.0.0.1", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }));
  console.log("Seeded khl-e2e; authentication state saved locally.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
