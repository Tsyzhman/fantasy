/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { fetchMobileRange } from "@/providers/khl-mobile/transport";
import { fetchHockeyHistory, parseHockeyHistory } from "@/providers/sports-ru-hockey/history";
import { importCalendar } from "./data-layer";
import { importHockeyHistory } from "./history-import";
import { refreshKhlProtocols } from "./protocol-scheduler";
import { publishRollingForecast } from "./rolling-forecast";
import { enqueueKhl } from "./jobs";
import { runNextKhl } from "./coordinator";
import { lockValidLease } from "./lease";
import { hockeyTeamLinks } from "@/providers/sports-ru-hockey/teams";
import { refreshKhlOdds } from "./odds-sync";

export async function refreshKhlHistory(db: PrismaClient, contestId: string, refreshSince?: Date) {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  const job = await enqueueKhl(db, "SPORTS_RU_STATS", contestId, "HISTORY");
  return runNextKhl(db, { "SPORTS_RU_STATS:HISTORY": async (job, signal) => {
    const lease = { id: job.id, token: job.leaseToken }, now = new Date();
    if (!contest.calendarObservedAt || now.getTime() - contest.calendarObservedAt.getTime() > 3600000) {
      const maps = await db.khlExternalEntityMap.findMany({ where: { seasonId: contest.seasonId, entityType: "season", providerScope: "global" } });
      const stageId = maps.find(m => m.provider === "KHL_MOBILE")?.externalId, officialSeasonId = maps.find(m => m.provider === "KHL")?.externalId;
      if (!stageId || !officialSeasonId) throw new Error("SEASON_MAPPING_UNAVAILABLE");
      const from = new Date(now.getTime() - 13 * 86400000), to = new Date(now.getTime() + 28 * 86400000);
      const calendar = await fetchMobileRange({ stageId, from, to, signal });
      await importCalendar(db, { contestId, stageId, officialSeasonId, ...calendar, from, to, batchId: randomUUID(), observedAt: now, lease });
    }
    const pool = await db.khlFantasyPlayer.findMany({ where: { contestId, active: true }, orderBy: { id: "asc" }, take: 1000 });
    const checkpoints = await db.khlProviderCheckpoint.findMany({ where: { provider: "SPORTS_RU_STATS", jobType: "PLAYER", scope: { in: pool.map(p => p.id) } }, take: 1000 });
    const checkMap = new Map(checkpoints.map(c => [c.scope, c]));
    const coverage = new Map(checkpoints.map(c => [c.scope, c.cursor as { played?: number; dnp?: number; quarantined?: string[]; error?: string }]));
    const teamMaps = await db.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "team", providerScope: "global", externalId: { in: hockeyTeamLinks.map(t => t[1]) } } });
    const finished = await db.khlMatch.findMany({ where: { seasonId: contest.seasonId, status: "FINAL" }, orderBy: { startsAt: "desc" }, take: 1000 });
    const latestFinal = (clubId: string) => {
      const officialId = hockeyTeamLinks.find(t => t[0] === clubId)?.[1];
      const teamId = teamMaps.find(t => t.externalId === officialId)?.teamId;
      const match = finished.find(m => m.homeId === teamId || m.awayId === teamId);
      return match ? `${match.id}:${match.revision}` : null;
    };
    const due = pool.filter(p => {
      const c = checkMap.get(p.id), cursor = c?.cursor as { priceRevision?: number; latestFinal?: string | null } | undefined;
      return !c || (refreshSince && c.completedAt < refreshSince) || (c.cursor as { identityVersion?: number }).identityVersion !== 2 || cursor?.priceRevision !== p.priceRevision || cursor?.latestFinal !== latestFinal(p.clubId) || now.getTime() - c.completedAt.getTime() > 86400000;
    });
    let imported = 0, changed = 0, processed = 0;
    for (const player of due.slice(0, 20)) {
      if (signal.aborted) throw new Error("LEASE_LOST");
      processed++;
      try {
      const source = await fetchHockeyHistory(contest.providerContestId, player.providerPlayerId, signal);
      const profile = parseHockeyHistory(source.html, { tagId: player.providerTagId ?? "", season: contest.season.seasonKey, position: player.position as "G" | "D" | "F" });
      const observedAt = new Date();
      const result = await importHockeyHistory(db, { contestId, fantasyPlayerId: player.id, profile, source: source.url, observedAt, lease });
      await db.$transaction(async tx => {
        await lockValidLease(tx, lease);
        const key = { provider: "SPORTS_RU_STATS", scope: player.id, jobType: "PLAYER" };
        const cursor = { identityVersion: 2, priceRevision: player.priceRevision, latestFinal: latestFinal(player.clubId), played: result.played, dnp: result.dnp, quarantined: result.quarantined };
        await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, cursor, completedAt: observedAt }, update: { cursor, completedAt: observedAt } });
      });
      imported++; changed += result.changed; coverage.set(player.id, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'HISTORY_FAILED';
        if (signal.aborted || /HTTP_40[13]|HTTP_429|LEASE|CONFLICT/.test(message)) throw error;
        const cursor = { identityVersion: 2, priceRevision: player.priceRevision, latestFinal: latestFinal(player.clubId), error: message, quarantined: [message] };
        await db.$transaction(async tx => {
          await lockValidLease(tx, lease);
          const key = { provider: 'SPORTS_RU_STATS', scope: player.id, jobType: 'PLAYER' };
          const data = { cursor, completedAt: new Date() };
          await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, ...data }, update: data });
        });
        coverage.set(player.id, cursor);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const observations = [...coverage.values()];
    const quarantined = pool.flatMap(p => (coverage.get(p.id)?.quarantined ?? []).map(r => `${p.providerPlayerId}:${r}`));
    const summary = { catalog: pool.length, profiles: pool.length - due.length + processed, imported, remaining: Math.max(0, due.length - processed), failedProfiles: observations.filter(c => c.error).length, played: observations.reduce((n, c) => n + (c.played ?? 0), 0), dnp: observations.reduce((n, c) => n + (c.dnp ?? 0), 0), changed, quarantineCount: quarantined.length, quarantined: quarantined.slice(0, 100) };
    await db.$transaction(async tx => {
      await lockValidLease(tx, lease);
      const data = { capabilities: ["official_fp", "toi", "goals", "assists", "plus_minus", "pim", "saves", "goals_against"], permissionStatus: "PUBLIC_READ", evidence: "User-authorized bounded reads of anonymous Sports.ru player pages; public mobile calendar. No claim of a licensed full-protocol/xG feed.", definitionVersion: "sports-ru-hockey-history-v1", verifiedAt: now, health: "HEALTHY", lastSuccessAt: new Date(), coverage: summary };
      await tx.khlSourceContract.upsert({ where: { provider: "SPORTS_RU_STATS" }, create: { provider: "SPORTS_RU_STATS", ...data }, update: data });
    });
    return summary;
  } }, job.id);
}

let started = false;
export function startKhlHistoryScheduler() {
  if (started || process.env.KHL_SYNC_ENABLED !== "true" || process.env.KHL_STATS_SYNC_ENABLED !== "true") return;
  started = true;
  async function tick() {
    try {
      const ids = (process.env.KHL_CATALOG_CONTEST_IDS ?? "").split(",").filter(id => /^\d{1,12}$/.test(id)).slice(0, 5);
      const contests = await prisma.khlContest.findMany({ where: { provider: "SPORTS_RU", providerContestId: { in: ids } }, take: 5 });
      for (const contest of contests) {
        if (process.env.KHL_DAILY_STATS_ENABLED !== "true") {
          const result = await refreshKhlHistory(prisma, contest.id);
          if (result && result.status !== "DONE") console.warn("KHL history sync", result);
          try { await refreshKhlProtocols(prisma, contest.id); }
          catch (error) { console.warn("KHL protocols", error instanceof Error ? error.message : "FAILED"); }
        }
        try { await refreshKhlOdds(prisma, contest.id); }
        catch (error) { console.warn("KHL odds", error instanceof Error ? error.message : "FAILED"); }
        try { await publishRollingForecast(prisma, contest.id); }
        catch (error) { console.warn("KHL rolling forecast", error instanceof Error ? error.message : "FAILED"); }
      }
    } catch (error) { console.error("KHL history scheduler failed", error); }
    finally { setTimeout(() => { void tick(); }, 60000).unref(); }
  }
  void tick();
}
