/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withEnv } from "@/test-utils/env";
import { buildCampaignReports } from "./build";
import { claimDueStageJob, deadlineBuildCutoffAt, executeDueStageJobs, finishStageJob, planDeadlineCampaigns, type ClaimedStageJob } from "./campaigns";
import { runDeadlineDeliveryTick } from "./delivery";
import { setTelegramLinkPaused } from "@/server/telegram/link-service";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
const now = new Date("2026-11-04T05:20:00Z");
after(() => prisma.$disconnect());

async function fixture(run: (data: { userId: string; contestId: string; campaignId: string; job: ClaimedStageJob }) => Promise<void>) {
  const suffix = randomUUID();
  const leagueId = BigInt(`0x${suffix.replaceAll("-", "").slice(0, 14)}`);
  const user = await prisma.user.create({ data: { email: `publication-${suffix}@example.test` } });
  await prisma.coreLeague.create({ data: { id: leagueId, name: `publication-${suffix}`, source: "test" } });
  const contest = await prisma.fantasyContest.create({ data: { leagueId, season: "test", name: "Англия", provider: "SPORTS_RU" } });
  const campaign = await prisma.deadlineCampaign.create({ data: { contestId: contest.id, season: "test", providerRoundId: "6", status: "ACTIVE", reportDate: "2026-11-04", deadlineAt: new Date("2026-11-04T12:00:00Z") } });
  try {
    await prisma.coreTeam.createMany({ data: [{ id: leagueId + 1n, name: "Home" }, { id: leagueId + 2n, name: "Away" }] });
    const round = await prisma.fantasyProviderRound.create({ data: { contestId: contest.id, provider: "SPORTS_RU", providerRoundId: "6", ordinal: 6, name: "Тур 6", deadlineAt: campaign.deadlineAt, fetchedAt: now } });
    await prisma.fantasyProviderFixture.create({ data: { contestId: contest.id, roundId: round.id, provider: "SPORTS_RU", providerFixtureId: "fixture", providerHomeTeamId: "home", providerAwayTeamId: "away", homeTeamId: leagueId + 1n, awayTeamId: leagueId + 2n, mappingStatus: "MATCHED", kickoffAt: new Date("2026-11-04T13:00:00Z"), fetchedAt: now } });
    const link = await prisma.telegramLink.create({ data: { userId: user.id, telegramUserId: suffix, chatId: suffix, state: "ACTIVE", consentAt: now } });
    await prisma.telegramSubscription.create({ data: { userId: user.id, linkId: link.id, contestId: contest.id, leagueId, season: "test", sourcePreference: "SITE_SAVED" } });
    const row = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, stage: "BUILD_REPORTS", inputVersion: 1, dueAt: now, nextAttemptAt: now, status: "RUNNING", leaseToken: "current", leaseUntil: new Date(now.getTime() + 15 * 60_000), attempts: 1 } });
    await run({ userId: user.id, contestId: contest.id, campaignId: campaign.id, job: { ...row, leaseToken: "current" } });
  } finally {
    await prisma.deadlineCampaign.delete({ where: { id: campaign.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.fantasyContest.delete({ where: { id: contest.id } });
    await prisma.coreTeam.deleteMany({ where: { id: { in: [leagueId + 1n, leagueId + 2n] } } });
    await prisma.coreLeague.delete({ where: { id: leagueId } });
  }
}

test("a valid stage publishes its report and finishes under the same fence", { skip }, async () => {
  await fixture(async ({ campaignId, job }) => {
    const result = await buildCampaignReports(prisma, { campaignId, stageJob: job, now });
    assert.equal(result.built, 1);
    assert.equal(await prisma.deadlineUserReport.count({ where: { campaignId } }), 1);
    assert.equal(await prisma.telegramOutbox.count({ where: { campaignId, state: "PENDING" } }), result.outboxParts);
    const accepted = await finishStageJob(prisma, job, { status: "SUCCEEDED" }, now, async tx => {
      await tx.deadlineCampaign.update({ where: { id: campaignId }, data: { status: "BUILT" } });
    });
    assert.equal(accepted, true);
    assert.equal((await prisma.deadlineCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status, "BUILT");
  });
});

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#deadlines */
for (const status of ["BUILT", "DELIVERING"]) {
  test(`a moved ${status} campaign quarantines old text and rebuilds only for its new date/version`, { skip }, async () => {
    await fixture(async ({ contestId, campaignId, job }) => {
      assert.equal((await buildCampaignReports(prisma, { campaignId, stageJob: job, now })).built, 1);
      await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { status } });
      await prisma.fantasyContest.update({ where: { id: contestId }, data: { scheduleRevision: "moved" } });
      await prisma.fantasyProviderRound.updateMany({ where: { contestId }, data: { deadlineAt: new Date("2026-11-05T12:00:00Z") } });
      await prisma.fantasyProviderFixture.updateMany({ where: { contestId }, data: { kickoffAt: new Date("2026-11-05T13:00:00Z") } });
      const today = new Date("2026-11-04T06:00:00Z");
      await planDeadlineCampaigns(prisma, { now: today, contestIds: [contestId] });
      const moved = await prisma.deadlineCampaign.findUniqueOrThrow({ where: { id: campaignId } });
      assert.equal(moved.inputVersion, 2);
      assert.equal(moved.reportDate, "2026-11-05");
      assert.equal(moved.status, "ACTIVE");
      assert.equal((await prisma.deadlineStageJob.findUniqueOrThrow({ where: { id: job.id } })).status, "CANCELLED");
      const jobs = await prisma.deadlineStageJob.findMany({ where: { campaignId, inputVersion: 2 }, orderBy: { dueAt: "asc" } });
      assert.deepEqual(jobs.map(row => row.dueAt.toISOString()), ["2026-11-05T05:00:00.000Z", "2026-11-05T05:10:00.000Z", "2026-11-05T05:15:00.000Z"]);
      assert.equal(await prisma.telegramOutbox.count({ where: { campaignId, state: "STALE" } }), 1);
      let sends = 0;
      const sendMessage = async () => { sends++; return { messageId: "moved-once" }; };
      await withEnv({ TELEGRAM_DEADLINE_ENABLED: "true", TELEGRAM_SEND_ENABLED: "true" }, async () => {
        await runDeadlineDeliveryTick(prisma, { now: today, sendMessage });
        assert.equal(sends, 0);
        assert.equal((await buildCampaignReports(prisma, { campaignId, stageJob: job, now: today })).built, 0);
        assert.equal((await buildCampaignReports(prisma, { campaignId, now: today })).built, 1);
        const rebuilt = await prisma.telegramOutbox.findFirstOrThrow({ where: { campaignId } });
        assert.equal(rebuilt.state, "PENDING");
        assert.equal(rebuilt.reportVersion, 2);
        assert.equal(rebuilt.nextAttemptAt.toISOString(), "2026-11-05T06:00:00.000Z");
        assert.equal(await prisma.deadlineUserReport.count({ where: { campaignId } }), 2);
        await runDeadlineDeliveryTick(prisma, { now: today, sendMessage });
        assert.equal(sends, 0);
        await runDeadlineDeliveryTick(prisma, { now: new Date("2026-11-05T06:00:00Z"), sendMessage });
        await runDeadlineDeliveryTick(prisma, { now: new Date("2026-11-05T06:00:00Z"), sendMessage });
        assert.equal(sends, 1);
      });
    });
  });
}

for (const state of ["SENT", "DELIVERY_UNKNOWN", "SENDING"]) {
  test(`rescheduling preserves ${state} parts and never creates a correction delivery`, { skip }, async () => {
    await fixture(async ({ userId, contestId, campaignId, job }) => {
      await buildCampaignReports(prisma, { campaignId, stageJob: job, now });
      await prisma.telegramOutbox.updateMany({ where: { campaignId }, data: { state, leaseToken: state === "SENDING" ? "in-flight" : null, leaseUntil: state === "SENDING" ? new Date(now.getTime() + 60_000) : null } });
      await prisma.telegramOutbox.create({ data: { userId, campaignId, partNumber: 2, nextAttemptAt: now, text: "remaining old part" } });
      await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { status: "DELIVERING" } });
      await prisma.fantasyProviderRound.updateMany({ where: { contestId }, data: { deadlineAt: new Date("2026-11-05T12:00:00Z") } });
      await prisma.fantasyProviderFixture.updateMany({ where: { contestId }, data: { kickoffAt: new Date("2026-11-05T13:00:00Z") } });
      await planDeadlineCampaigns(prisma, { now, contestIds: [contestId] });
      assert.equal((await prisma.telegramOutbox.findFirstOrThrow({ where: { campaignId, partNumber: 1 } })).state, state);
      assert.equal((await prisma.telegramOutbox.findFirstOrThrow({ where: { campaignId, partNumber: 2 } })).state, "CANCELLED");
      assert.equal((await buildCampaignReports(prisma, { campaignId, now })).built, 0);
      assert.equal(await prisma.telegramOutbox.count({ where: { campaignId } }), 2);
    });
  });
}

for (const invalid of ["token", "lease", "status", "inputVersion", "cancelledCampaign"]) {
  test(`${invalid} fence rejects report, outbox, snapshot and final status publication`, { skip }, async () => {
    await fixture(async ({ campaignId, job }) => {
      if (invalid === "token") await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { leaseToken: "successor" } });
      if (invalid === "lease") await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { leaseUntil: now } });
      if (invalid === "status") await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
      if (invalid === "inputVersion") await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { inputVersion: 2 } });
      if (invalid === "cancelledCampaign") await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } });
      assert.equal((await buildCampaignReports(prisma, { campaignId, stageJob: job, now })).built, 0);
      let publishes = 0;
      assert.equal(await finishStageJob(prisma, job, { status: "SUCCEEDED" }, now, async tx => {
        publishes++;
        await tx.deadlineDataSnapshot.create({ data: { campaignId, inputVersion: 1, dataset: "STALE" } });
      }), false);
      assert.equal(publishes, 0);
      assert.equal(await prisma.deadlineUserReport.count({ where: { campaignId } }), 0);
      assert.equal(await prisma.telegramOutbox.count({ where: { campaignId } }), 0);
      assert.equal(await prisma.deadlineDataSnapshot.count({ where: { campaignId } }), 0);
    });
  });
}

test("publication rolls back both artifacts and final job status on failure", { skip }, async () => {
  await fixture(async ({ campaignId, job }) => {
    await assert.rejects(finishStageJob(prisma, job, { status: "SUCCEEDED" }, now, async tx => {
      await tx.deadlineDataSnapshot.create({ data: { campaignId, inputVersion: 1, dataset: "ROLLBACK" } });
      throw new Error("mock publication failure");
    }), /mock publication failure/);
    assert.equal(await prisma.deadlineDataSnapshot.count({ where: { campaignId } }), 0);
    assert.equal((await prisma.deadlineStageJob.findUniqueOrThrow({ where: { id: job.id } })).status, "RUNNING");
  });
});

test("a lease that expires while waiting for a database lock cannot publish", { skip, timeout: 10_000 }, async () => {
  await fixture(async ({ campaignId, job }) => {
    await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(now.getTime() + 50) } });
    let locked!: () => void;
    let release!: () => void;
    const lockReached = new Promise<void>(resolve => { locked = resolve; });
    const unlocked = new Promise<void>(resolve => { release = resolve; });
    const blocker = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "deadline_campaigns" WHERE "id" = ${campaignId} FOR UPDATE`;
      locked();
      await unlocked;
    });
    await lockReached;
    let publishes = 0;
    const completing = finishStageJob(prisma, job, { status: "SUCCEEDED" }, now, async () => { publishes++; });
    try { await new Promise(resolve => setTimeout(resolve, 100)); }
    finally { release(); }
    await blocker;
    assert.equal(await completing, false);
    assert.equal(publishes, 0);
  });
});

test("a lease that expires while acquiring the transaction connection cannot publish", { skip }, async () => {
  await fixture(async ({ job }) => {
    await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(now.getTime() + 50) } });
    const slowPool = { $transaction: async (publish: (tx: Prisma.TransactionClient) => Promise<boolean>) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return prisma.$transaction(publish);
    } } as unknown as typeof prisma;
    let publishes = 0;
    assert.equal(await finishStageJob(slowPool, job, { status: "SUCCEEDED" }, now, async () => { publishes++; }), false);
    assert.equal(publishes, 0);
  });
});

test("a successor claim while a report is computing fences the old worker", { skip, timeout: 10_000 }, async () => {
  await fixture(async ({ campaignId, job }) => {
    let readReached!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>(resolve => { readReached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const slowDb = prisma.$extends({ query: { fantasyPlayerPoolSnapshot: { async findFirst({ args, query }) {
      readReached();
      await paused;
      return query(args);
    } } } });
    const building = buildCampaignReports(slowDb as unknown as typeof prisma, { campaignId, stageJob: job, now });
    try {
      await reached;
      await prisma.deadlineStageJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(now.getTime() - 1) } });
      const successor = await claimDueStageJob(prisma, now);
      assert.equal(successor?.id, job.id);
      assert.notEqual(successor?.leaseToken, job.leaseToken);
    } finally { resume(); }
    assert.equal((await building).built, 0);
    assert.equal(await prisma.deadlineUserReport.count({ where: { campaignId } }), 0);
    assert.equal(await prisma.telegramOutbox.count({ where: { campaignId } }), 0);
  });
});

test("pause/resume while computing cannot publish a stale consent version", { skip, timeout: 10_000 }, async () => {
  await fixture(async ({ campaignId, userId, job }) => {
    let readReached!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>(resolve => { readReached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const slowDb = prisma.$extends({ query: { fantasyPlayerPoolSnapshot: { async findFirst({ args, query }) {
      readReached();
      await paused;
      return query(args);
    } } } });
    const building = buildCampaignReports(slowDb as unknown as typeof prisma, { campaignId, stageJob: job, now });
    try {
      await reached;
      await setTelegramLinkPaused(prisma, { userId, paused: true });
      await setTelegramLinkPaused(prisma, { userId, paused: false });
    } finally { resume(); }
    assert.equal((await building).built, 0);
    assert.equal(await prisma.telegramOutbox.count({ where: { campaignId } }), 0);
  });
});

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
test("08:50 Moscow is 05:50 UTC and report retries stop at the cutoff", { skip }, async () => {
  assert.equal(deadlineBuildCutoffAt("2026-11-04").toISOString(), "2026-11-04T05:50:00.000Z");
  for (const [at, expected] of [["2026-11-04T05:49:00Z", "QUEUED"], ["2026-11-04T05:50:00Z", "DEGRADED"]]) {
    const campaign = await prisma.deadlineCampaign.create({ data: { contestId: `cutoff-${randomUUID()}`, season: "test", providerRoundId: "1", status: "ACTIVE", reportDate: "2026-11-04" } });
    try {
      const job = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1, stage: "BUILD_REPORTS", dueAt: now, nextAttemptAt: now } });
      await executeDueStageJobs(prisma, { now: new Date(at), maxJobs: 1 });
      assert.equal((await prisma.deadlineStageJob.findUniqueOrThrow({ where: { id: job.id } })).status, expected);
    } finally { await prisma.deadlineCampaign.delete({ where: { id: campaign.id } }); }
  }
});
