/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { claimDueStageJob } from "./campaigns";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

test("a report build waits for running and queued refreshes, then accepts a terminal outcome", { skip }, async () => {
  const now = new Date("2026-10-09T05:15:00Z");
  const campaign = await prisma.deadlineCampaign.create({ data: { contestId: `test-${randomUUID()}`, season: "test", providerRoundId: "1" } });
  try {
    const refresh = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1,
      stage: "DATA_REFRESH", status: "RUNNING", dueAt: now, nextAttemptAt: now } });
    const build = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1,
      stage: "BUILD_REPORTS", dueAt: now, nextAttemptAt: now } });
    assert.equal(await claimDueStageJob(prisma, now), null);
    await prisma.deadlineStageJob.update({ where: { id: refresh.id }, data: { status: "QUEUED", nextAttemptAt: new Date(now.getTime() + 300_000) } });
    assert.equal(await claimDueStageJob(prisma, now), null);
    await prisma.deadlineStageJob.update({ where: { id: refresh.id }, data: { status: "DEGRADED" } });
    assert.equal((await claimDueStageJob(prisma, now))?.id, build.id);
  } finally { await prisma.deadlineCampaign.delete({ where: { id: campaign.id } }); }
});

test("another input version does not block this report build", { skip }, async () => {
  const now = new Date("2026-10-09T05:15:00Z");
  const campaign = await prisma.deadlineCampaign.create({ data: { contestId: `test-${randomUUID()}`, season: "test", providerRoundId: "1" } });
  try {
    await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 2,
      stage: "DATA_REFRESH", status: "RUNNING", dueAt: now, nextAttemptAt: now } });
    const build = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1,
      stage: "BUILD_REPORTS", dueAt: now, nextAttemptAt: now } });
    assert.equal((await claimDueStageJob(prisma, now))?.id, build.id);
  } finally { await prisma.deadlineCampaign.delete({ where: { id: campaign.id } }); }
});

/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery */
test("an abandoned refresh lease is retried and cannot strand its dependent build", { skip }, async () => {
  const now = new Date("2026-10-09T05:15:00Z");
  const campaign = await prisma.deadlineCampaign.create({ data: { contestId: `test-${randomUUID()}`, season: "test", providerRoundId: "1" } });
  try {
    const refresh = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1,
      stage: "DATA_REFRESH", status: "RUNNING", attempts: 1, leaseToken: "abandoned",
      leaseUntil: new Date(now.getTime() - 60_000), dueAt: new Date(now.getTime() - 300_000), nextAttemptAt: now } });
    const build = await prisma.deadlineStageJob.create({ data: { campaignId: campaign.id, inputVersion: 1,
      stage: "BUILD_REPORTS", dueAt: now, nextAttemptAt: now } });
    const retry = await claimDueStageJob(prisma, now);
    assert.equal(retry?.id, refresh.id);
    assert.equal(retry?.attempts, 2);
    assert.notEqual(retry?.leaseToken, "abandoned");
    await prisma.deadlineStageJob.update({ where: { id: refresh.id }, data: {
      attempts: 5, leaseUntil: new Date(now.getTime() - 1)
    } });
    assert.equal((await claimDueStageJob(prisma, now))?.id, build.id);
    assert.equal((await prisma.deadlineStageJob.findUnique({ where: { id: refresh.id } }))?.status, "FAILED");
  } finally { await prisma.deadlineCampaign.delete({ where: { id: campaign.id } }); }
});
