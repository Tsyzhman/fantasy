/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#pipeline */
import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { planDeadlineCampaigns } from "./campaigns";
test("unchanged delivered campaigns perform zero writes across repeated delivery ticks", async () => {
  const deadlineAt = new Date("2026-10-11T10:00:00Z");
  let writes = 0;
  const db = {
    fantasyContest: { findUnique: async () => ({ id: "contest", name: "АПЛ", provider: "SPORTS_RU", season: "2026/2027", leagueId: 47n, rules: {}, scheduleRevision: 4 }) },
    fantasyProviderRound: { findMany: async () => [{ id: "round", providerRoundId: "6", ordinal: 6, deadlineAt }] },
    deadlineCampaign: { findUnique: async () => ({ id: "campaign", deadlineAt, scheduleVersion: 4, status: "DONE" }), update: async () => { writes++; } },
    deadlineStageJob: { upsert: async () => { writes++; }, updateMany: async () => { writes++; } },
  } as unknown as PrismaClient;
  for (let tick = 0; tick < 360; tick++) await planDeadlineCampaigns(db, { contestIds: ["contest"], now: new Date("2026-10-10T10:00:00Z") });
  assert.equal(writes, 0);
  await planDeadlineCampaigns({ ...db, fantasyContest: { findUnique: async () => ({ id: "contest", name: "АПЛ", provider: "SPORTS_RU", season: "2026/2027", leagueId: 47n, rules: {}, scheduleRevision: 5 }) } } as unknown as PrismaClient,
    { contestIds: ["contest"], now: new Date("2026-10-10T10:00:00Z") });
  assert.equal(writes, 1, "actual schedule change still updates the campaign");
});
