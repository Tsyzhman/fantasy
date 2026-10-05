/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile, stat } from "node:fs/promises";
import { bootstrapKhlContest } from "../src/server/khl/bootstrap";
import { refreshKhlProtocols } from "../src/server/khl/protocol-scheduler";
import { importKhlProtocolHtml } from "../src/server/khl/protocol-import";
import { publishRollingForecast } from "../src/server/khl/rolling-forecast";
import { publishBaseline } from "../src/server/khl/forecast-publication";
import { fetchMobileRange } from "../src/providers/khl-mobile/transport";
import { importCalendar } from "../src/server/khl/data-layer";
import { runNextKhl } from "../src/server/khl/coordinator";
import { fetchHockeyCatalog } from "../src/providers/sports-ru-hockey/catalog";
import { importCatalog } from "../src/server/khl/catalog-sync";
import { khlResourceStatus, enqueueKhl } from "../src/server/khl/jobs";
import { pruneKhl } from "../src/server/khl/retention";
import { refreshKhlHistory } from "../src/server/khl/history-scheduler";
import { refreshHistoricalSeason, exportHistoricalBundle, importHistoricalBundle } from "../src/server/khl/historical-season";
import { importProtocolArchive } from "../src/server/khl/protocol-archive-import";
import { runKhlDailySync } from "../src/server/khl/daily-sync";
import { refreshKhlOdds } from "../src/server/khl/odds-sync";
import { importIdentityAudit } from "../src/server/khl/identity-audit";
import { refreshKhlFantasyCalendar } from "../src/server/khl/fantasy-calendar";
const db = new PrismaClient();
async function main() {
  const [command, contestId, fromText, toText] = process.argv.slice(2);
  if (command === "status") { console.log(JSON.stringify(await khlResourceStatus(db))); return; }
  if (process.env.KHL_SYNC_ENABLED !== "true") throw new Error("KHL_SYNC_DISABLED");
  if (command === "identity-import" && contestId && fromText) {
    if ((await stat(fromText)).size > 2 * 1024 * 1024) throw new Error('IDENTITY_BUNDLE_TOO_LARGE');
    console.log(await importIdentityAudit(db, contestId, JSON.parse(await readFile(fromText, 'utf8')), !process.argv.includes('--apply'))); return;
  }
  if (command === "odds" && contestId) { console.log(await refreshKhlOdds(db, contestId, true)); return; }
  if (command === "weeks" && contestId) { console.log(JSON.stringify(await refreshKhlFantasyCalendar(db, contestId))); return; }
  if (["daily", "hourly"].includes(command) && contestId) { const result = await runKhlDailySync(db, contestId); console.log(JSON.stringify(result)); if (result.status === "PARTIAL") process.exitCode = 2; return; }
  if (command === "prune") { console.log(await pruneKhl(db, new Date())); return; }
  if (command === "bootstrap" && contestId) {
    if ((await stat(contestId)).size > 16384) throw new Error("METADATA_TOO_LARGE");
    console.log(await bootstrapKhlContest(db, JSON.parse(await readFile(contestId, "utf8")))); return;
  }
  if (command === "protocols" && contestId) { console.log(await refreshKhlProtocols(db, contestId)); return; }
  if (command === "forecast" && contestId) { console.log(await publishRollingForecast(db, contestId)); return; }
  if (command === "previous-protocols-import" && contestId && fromText) {
    if ((await stat(fromText)).size > 20 * 1024 * 1024) throw new Error("HISTORY_BUNDLE_TOO_LARGE");
    console.log(await importProtocolArchive(db, contestId, JSON.parse(await readFile(fromText, "utf8")))); return;
  }
  if (command === "previous-season-export" && contestId && fromText) {
    const bundle = await exportHistoricalBundle(db, contestId);
    await writeFile(fromText, JSON.stringify(bundle)); console.log({ exported: bundle.entries.length, seasonKey: bundle.seasonKey }); return;
  }
  if (command === "previous-season-import" && contestId && fromText) {
    if ((await stat(fromText)).size > 20 * 1024 * 1024) throw new Error("HISTORY_BUNDLE_TOO_LARGE");
    console.log(await importHistoricalBundle(db, contestId, JSON.parse(await readFile(fromText, "utf8")))); return;
  }
  if (command === "previous-season" && contestId) {
    for (let batch = 0; batch < (fromText === "--all" ? 60 : 1); batch++) {
      const result = await refreshHistoricalSeason(db, contestId);
      console.log(JSON.stringify(result));
      if (!result.remaining || fromText !== "--all") return;
      if (result.errors.some(e => /HTTP_(401|403|429)/.test(e.message))) throw new Error("HISTORY_ARCHIVE_SOURCE_UNAVAILABLE");
    }
    throw new Error("HISTORY_ARCHIVE_BATCH_LIMIT");
  }
  if (command === "protocol" && contestId && fromText && toText) {
    if ((await stat(toText)).size > 5 * 1024 * 1024) throw new Error("PROTOCOL_TOO_LARGE");
    console.log(await importKhlProtocolHtml(db, { contestId, officialMatchId: fromText, html: await readFile(toText, "utf8"), observedAt: new Date(), dryRun: process.argv.includes("--dry-run") })); return;
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
      if (fromText !== "--all" || !(job.cursor as { remaining?: number })?.remaining) return;
    }
    throw new Error("HISTORY_BATCH_LIMIT");
  }
  if (!["catalog", "calendar"].includes(command) || !contestId) throw new Error("Usage: status | prune | bootstrap metadata.json | catalog CONTEST | statistics CONTEST [--all] | weeks CONTEST | calendar CONTEST FROM_ISO TO_ISO | baseline CONTEST WEEK");
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
