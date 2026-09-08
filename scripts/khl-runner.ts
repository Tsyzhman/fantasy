/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readFile, stat } from "node:fs/promises";
import { bootstrapKhlContest } from "../src/server/khl/bootstrap";
import { publishBaseline } from "../src/server/khl/forecast-publication";
import { fetchMobileRange } from "../src/providers/khl-mobile/transport";
import { importCalendar } from "../src/server/khl/data-layer";
import { runNextKhl } from "../src/server/khl/coordinator";
import { fetchHockeyCatalog } from "../src/providers/sports-ru-hockey/catalog";
import { importCatalog } from "../src/server/khl/catalog-sync";
import { khlResourceStatus, enqueueKhl } from "../src/server/khl/jobs";
import { pruneKhl } from "../src/server/khl/retention";
import { refreshKhlHistory } from "../src/server/khl/history-scheduler";
const db = new PrismaClient();
async function main() {
  const [command, contestId, fromText, toText] = process.argv.slice(2);
  if (command === "status") { console.log(JSON.stringify(await khlResourceStatus(db))); return; }
  if (process.env.KHL_SYNC_ENABLED !== "true") throw new Error("KHL_SYNC_DISABLED");
  if (command === "prune") { console.log(await pruneKhl(db, new Date())); return; }
  if (command === "bootstrap" && contestId) {
    if ((await stat(contestId)).size > 16384) throw new Error("METADATA_TOO_LARGE");
    console.log(await bootstrapKhlContest(db, JSON.parse(await readFile(contestId, "utf8")))); return;
  }
  if (command === "baseline" && contestId && fromText) { console.log(await publishBaseline(db, contestId, fromText, new Date())); return; }
  if (command === "statistics" && contestId) {
    for (let batch = 0; batch < (fromText === "--all" ? 100 : 1); batch++) {
      const result = await refreshKhlHistory(db, contestId);
      console.log(JSON.stringify(result));
      if (!result) { if (fromText !== "--all") return; await new Promise(r => setTimeout(r, 3000)); continue; }
      if (result.status !== "DONE") throw new Error(`HISTORY_JOB_${result.status}`);
      const job = await db.khlSyncJob.findUniqueOrThrow({ where: { id: result.id } });
      console.log(JSON.stringify(job.cursor));
      if (!(job.cursor as { remaining?: number })?.remaining) return;
    }
    throw new Error("HISTORY_BATCH_LIMIT");
  }
  if (!["catalog", "calendar"].includes(command) || !contestId) throw new Error("Usage: status | prune | bootstrap metadata.json | catalog CONTEST | statistics CONTEST [--all] | calendar CONTEST FROM_ISO TO_ISO | baseline CONTEST WEEK");
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId } });
  const provider = command === "catalog" ? "SPORTS_RU" : "KHL_MOBILE";
  if (command === "calendar") {
    const source = await db.khlSourceContract.findUnique({ where: { provider } });
    if (source?.permissionStatus !== "VERIFIED" || !source.verifiedAt) throw new Error("KHL_MOBILE_PERMISSION_UNVERIFIED");
  }
  const job = await enqueueKhl(db, provider, contest.id, command.toUpperCase());
  console.log(await runNextKhl(db, {
    "SPORTS_RU:CATALOG": async (job, signal) => {
      const observedAt = new Date();
      const parsed = await fetchHockeyCatalog(contest.providerContestId);
      if (parsed.quarantined.length) throw new Error(`CATALOG_QUARANTINE:${parsed.quarantined.length}`);
      if (signal.aborted) throw new Error("LEASE_LOST");
      return { ...await importCatalog(db, contest.id, parsed.rows, randomUUID(), observedAt, true, { id: job.id, token: job.leaseToken }) };
    },
    "KHL_MOBILE:CALENDAR": async (_job, signal) => {
      const observedAt = new Date();
      const maps = await db.khlExternalEntityMap.findMany({ where: { seasonId: contest.seasonId, entityType: "season", providerScope: "global" } });
      const stageId = maps.find(m => m.provider === "KHL_MOBILE")?.externalId, officialSeasonId = maps.find(m => m.provider === "KHL")?.externalId;
      if (!stageId || !officialSeasonId) throw new Error("SEASON_MAPPING_UNAVAILABLE");
      const from = new Date(fromText), to = new Date(toText);
      const batch = await fetchMobileRange({ stageId, from, to, signal });
      if (signal.aborted) throw new Error("LEASE_LOST");
      return { ...await importCalendar(db, { contestId, stageId, officialSeasonId, ...batch, from, to, batchId: randomUUID(), observedAt, lease: { id: _job.id, token: _job.leaseToken } }), from: from.toISOString(), to: to.toISOString() };
    }
  }, job.id));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "KHL_RUN_FAILED"); process.exitCode = 1; }).finally(() => db.$disconnect());
