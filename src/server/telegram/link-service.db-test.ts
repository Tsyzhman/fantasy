import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { withEnv } from "@/test-utils/env";
import {
  consumeTelegramChallenge,
  confirmTelegramLink,
  createTelegramLinkSession,
  expireTelegramLinkArtifacts,
  issueTelegramLinkChallenge,
  loadTelegramOverview,
  replaceTelegramSubscriptions,
  setTelegramLinkPaused,
  unlinkTelegram
} from "./link-service";
import { consumeTelegramRateLimit } from "./rate-limit";
import { processTelegramUpdate } from "./updates";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#acceptance
 */
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
const suffix = randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdContestIds: string[] = [];
const createdLeagueIds: bigint[] = [];

function uniqueTelegramId(): string {
  return BigInt(`0x${randomUUID().replace(/-/g, "")}`).toString().slice(0, 12);
}

async function createUser(label: string) {
  const user = await prisma.user.create({ data: { email: `telegram-${label}-${suffix}@example.test` } });
  createdUserIds.push(user.id);
  return user;
}

async function createContest(userId: string) {
  const leagueId = BigInt(`9${String(Date.now()).slice(-9)}`);
  const league = await prisma.coreLeague.create({ data: { id: leagueId, name: `Telegram test league ${suffix}`, source: "fotmob" } });
  createdLeagueIds.push(league.id);
  const contest = await prisma.fantasyContest.create({
    data: { leagueId: league.id, season: "2026/2027", name: `Telegram test contest ${suffix}` }
  });
  createdContestIds.push(contest.id);
  const squad = await prisma.userFantasySquad.create({ data: { userId, contestId: contest.id, leagueId: league.id, season: "2026/2027" } });
  return { contest, squad };
}

after(async () => {
  if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  if (createdContestIds.length > 0) await prisma.fantasyContest.deleteMany({ where: { id: { in: createdContestIds } } }).catch(() => undefined);
  if (createdLeagueIds.length > 0) await prisma.coreLeague.deleteMany({ where: { id: { in: createdLeagueIds } } }).catch(() => undefined);
  await prisma.telegramInbox.deleteMany({ where: { botId: "123456" } }).catch(() => undefined);
  await prisma.telegramRateLimit.deleteMany({ where: { action: { startsWith: "telegram:test:" } } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("telegram linking lifecycle, conflicts and unsubscribe", { skip }, async () => {
  await withEnv({ TELEGRAM_LINK_SECRET: "test-link-secret", TELEGRAM_BOT_USERNAME: "fantasy_test_bot", TELEGRAM_LINK_ENABLED: "true" }, async () => {
    const stagingUser = await createUser("lifecycle");
    const otherUser = await createUser("conflict");
    const { contest } = await createContest(stagingUser.id);
    const telegramUserId = uniqueTelegramId();
    const identity = { telegramUserId, chatId: telegramUserId, username: `test_${suffix}`, firstName: "Test" };
    const now = new Date("2026-09-25T08:00:00.000Z");

    const session = await createTelegramLinkSession(prisma, stagingUser.id, now);
    assert.equal(session.state, "OPEN");
    const challenge = await issueTelegramLinkChallenge(prisma, { userId: stagingUser.id, now });
    assert.equal(challenge.code.length, 14);
    assert.ok(challenge.deepLink?.includes("fantasy_test_bot"));

    const consumed = await consumeTelegramChallenge(prisma, { kind: "code", value: challenge.code, identity, now });
    assert.equal(consumed.status, "PENDING");
    assert.equal((await loadTelegramOverview(prisma, stagingUser.id)).state, "PENDING");

    const confirmed = await confirmTelegramLink(prisma, { userId: stagingUser.id, approve: true, now });
    assert.equal(confirmed.status, "ACTIVE");
    const activeOverview = await loadTelegramOverview(prisma, stagingUser.id);
    assert.equal(activeOverview.state, "ACTIVE");
    assert.ok(activeOverview.link?.consentAt);

    const replay = await consumeTelegramChallenge(prisma, { kind: "code", value: challenge.code, identity, now });
    assert.equal(replay.status, "EXPIRED");

    const otherSession = await createTelegramLinkSession(prisma, otherUser.id, now);
    const otherChallenge = await issueTelegramLinkChallenge(prisma, { userId: otherUser.id, now, sessionId: otherSession.id });
    const conflict = await consumeTelegramChallenge(prisma, { kind: "code", value: otherChallenge.code, identity, now });
    assert.equal(conflict.status, "CONFLICT");

    assert.equal((await setTelegramLinkPaused(prisma, { userId: stagingUser.id, paused: true })).status, "PAUSED");
    assert.equal((await setTelegramLinkPaused(prisma, { userId: stagingUser.id, paused: false })).status, "ACTIVE");

    const saved = await replaceTelegramSubscriptions(prisma, {
      userId: stagingUser.id,
      subscriptions: [{ contestId: contest.id, sourcePreference: "SPORTS_PUBLISHED" }]
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.contestId, contest.id);

    await unlinkTelegram(prisma, stagingUser.id);
    assert.equal((await loadTelegramOverview(prisma, stagingUser.id)).state, "REVOKED");

    const reLinkSession = await createTelegramLinkSession(prisma, otherUser.id, now);
    const reLinkChallenge = await issueTelegramLinkChallenge(prisma, { userId: otherUser.id, now, sessionId: reLinkSession.id });
    const reLink = await consumeTelegramChallenge(prisma, { kind: "code", value: reLinkChallenge.code, identity, now });
    assert.equal(reLink.status, "PENDING");
  });
});

test("expired pending candidates and challenges are purged", { skip }, async () => {
  await withEnv({ TELEGRAM_LINK_SECRET: "test-link-secret", TELEGRAM_LINK_ENABLED: "true" }, async () => {
    const user = await createUser("expiry");
    const telegramUserId = uniqueTelegramId();
    const now = new Date("2026-09-25T08:00:00.000Z");
    const session = await createTelegramLinkSession(prisma, user.id, now);
    const challenge = await issueTelegramLinkChallenge(prisma, { userId: user.id, now, sessionId: session.id });
    await consumeTelegramChallenge(prisma, {
      kind: "secret",
      value: challenge.secret,
      identity: { telegramUserId, chatId: telegramUserId, username: null, firstName: "Expiry" },
      now
    });
    await prisma.telegramLink.updateMany({ where: { userId: user.id }, data: { pendingExpiresAt: new Date(now.getTime() - 1000) } });
    await expireTelegramLinkArtifacts(prisma, now);
    assert.equal(await prisma.telegramLink.findUnique({ where: { userId: user.id } }), null);
  });
});

test("telegram rate limits are atomic and report retry windows", { skip }, async () => {
  const subject = `subject-${suffix}`;
  const first = await consumeTelegramRateLimit(prisma, { action: "telegram:test:minute", subject, limit: 2, windowMs: 60_000 });
  const second = await consumeTelegramRateLimit(prisma, { action: "telegram:test:minute", subject, limit: 2, windowMs: 60_000 });
  const third = await consumeTelegramRateLimit(prisma, { action: "telegram:test:minute", subject, limit: 2, windowMs: 60_000 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds >= 1);
});

test("webhook accepts a code once and stores the update durably", { skip }, async () => {
  await withEnv(
    { TELEGRAM_LINK_ENABLED: "true", TELEGRAM_LINK_SECRET: "test-link-secret", TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN" },
    async () => {
      const user = await createUser("webhook");
      const telegramUserId = uniqueTelegramId();
      const now = new Date();
      const session = await createTelegramLinkSession(prisma, user.id, now);
      const challenge = await issueTelegramLinkChallenge(prisma, { userId: user.id, now, sessionId: session.id });
      const replies: string[] = [];
      const updateId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
      const update = {
        update_id: updateId,
        message: {
          message_id: 1,
          from: { id: Number(telegramUserId.replace(/\D/g, "").slice(0, 9)), is_bot: false, username: `webhook_${suffix}`, first_name: "Webhook" },
          chat: { id: Number(telegramUserId.replace(/\D/g, "").slice(0, 9)), type: "private" },
          text: challenge.code
        }
      };
      const result = await processTelegramUpdate(prisma, update, {
        sendMessage: async (_chatId, text) => {
          replies.push(text);
        }
      });
      assert.equal(result.status, "PROCESSED");
      assert.ok(replies.some((reply) => reply.includes("Код принят")), JSON.stringify(replies));
      const duplicate = await processTelegramUpdate(prisma, update, { sendMessage: async () => undefined });
      assert.equal(duplicate.status, "DUPLICATE");
      assert.equal(await prisma.telegramInbox.count({ where: { botId: "123456", updateId: BigInt(updateId) } }), 1);
    }
  );
});
