/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hockeyTeamLinks } from "@/providers/sports-ru-hockey/teams";
import { type HockeyHistory, type HockeyHistoryRow } from "@/providers/sports-ru-hockey/history";
import { appendRevision, contentHash } from "@/khl/repositories/revisions";
import { bindExternalEntity } from "./data-layer";
import { lockValidLease, type KhlLease } from "./lease";

const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
export async function importHockeyHistory(db: PrismaClient, input: { contestId: string; fantasyPlayerId: string; profile: HockeyHistory; source: string; observedAt: Date; lease?: KhlLease }) {
  const { profile, observedAt, source } = input;
  return db.$transaction(async tx => {
    await lockValidLease(tx, input.lease);
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id=${input.contestId} FOR UPDATE`;
    const player = await tx.khlFantasyPlayer.findFirstOrThrow({ where: { id: input.fantasyPlayerId, contestId: input.contestId }, include: { contest: { include: { season: true } } } });
    const link = hockeyTeamLinks.find(t => t[0] === player.clubId && t[2] === profile.clubSlug);
    if (!player.playerId || !link || profile.position !== player.position || profile.season !== player.contest.season.seasonKey || profile.tagId && profile.tagId !== player.providerTagId || source !== `https://www.sports.ru/fantasy/hockey/player/info/${player.contest.providerContestId}/${player.providerPlayerId}.html`) throw new Error("HISTORY_PLAYER_SCOPE_INVALID");
    // The catalog has surnames only; the identity-checked profile carries the full name.
    await tx.khlPlayer.update({ where: { id: player.playerId }, data: { name: profile.name } });
    const teamMaps = await tx.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "team", providerScope: "global", externalId: { in: hockeyTeamLinks.map(t => t[1]) } } });
    const internal = (external: string) => teamMaps.find(m => m.externalId === external)?.teamId;
    const teamId = internal(link[1]); if (!teamId) throw new Error("HISTORY_TEAM_MAPPING_UNAVAILABLE");
    const matches = await tx.khlMatch.findMany({ where: { seasonId: player.contest.seasonId, OR: [{ homeId: teamId }, { awayId: teamId }] }, orderBy: { startsAt: "desc" }, take: 200 });
    const matchFor = (row: HockeyHistoryRow) => {
      const opponent = hockeyTeamLinks.find(t => t[2] === row.opponentSlug);
      const opponentId = opponent && internal(opponent[1]);
      const candidates = matches.filter(m => day(m.startsAt) === row.date && (row.home ? m.homeId === teamId && m.awayId === opponentId : m.awayId === teamId && m.homeId === opponentId));
      if (candidates.length !== 1) return null;
      const match = candidates[0];
      if (row.score && typeof match.finalScore === "string" && row.score !== match.finalScore.replace(/\s/g, "")) return null;
      return match;
    };
    const existing = await tx.khlPlayerMatchStat.findMany({ where: { playerId: player.playerId, match: { seasonId: player.contest.seasonId } }, take: 200 });
    const scores = await tx.khlOfficialFantasyScore.findMany({ where: { fantasyPlayerId: player.id }, take: 200 });
    let changed = 0, played = 0, dnp = 0; const quarantined: string[] = [];
    const batchId = randomUUID();
    for (const row of profile.rows) {
      const match = matchFor(row);
      if (!match || match.status !== "FINAL" || match.startsAt > observedAt) { quarantined.push(`${row.date}:${row.opponentSlug}`); continue; }
      const participationStatus = row.toiSeconds === null ? "UNKNOWN" : row.toiSeconds > 0 ? "PLAYED" : "DNP";
      const facts = { participationStatus, toiSeconds: row.toiSeconds, goals: row.goals, assists: row.assists, plusMinus: row.plusMinus, pimMinutes: row.pimMinutes, saves: row.saves, goalsAgainst: row.goalsAgainst, clubAtMatchId: teamId };
      if (participationStatus === "DNP" && [row.goals, row.assists, row.pimMinutes, row.saves, row.goalsAgainst].some(n => n !== null && n !== 0)) throw new Error("HISTORY_DNP_CONFLICT");
      const previous = existing.find(s => s.matchId === match.id);
      // Full match protocols own their fields; Sports.ru still supplies fantasy FP.
      const priorSources = previous?.sources as Record<string, string> | undefined;
      const protocolOwnsStats = priorSources?.toiSeconds?.startsWith("https://www.khl.ru/game/");
      const before = previous && Object.fromEntries(Object.keys(facts).map(k => [k, previous[k as keyof typeof previous]]));
      if (!protocolOwnsStats && (!before || contentHash(before) !== contentHash(facts))) {
        const revision = await appendRevision(tx, { streamId: `SPORTS_RU:history:${player.id}:${match.id}`, transitionKey: batchId, value: facts, observedAt, availableAt: observedAt });
        const sources = { ...(previous?.sources as Record<string, string> ?? {}), ...Object.fromEntries(Object.keys(facts).map(k => [k, source])) };
        await tx.khlPlayerMatchStat.upsert({ where: { matchId_playerId: { matchId: match.id, playerId: player.playerId } }, create: { matchId: match.id, playerId: player.playerId, ...facts, sources, observedAt, availableAt: observedAt, revision: revision.sequence }, update: { ...facts, sources, observedAt, availableAt: observedAt, revision: revision.sequence } });
        changed++;
      } else if (!protocolOwnsStats) await tx.khlPlayerMatchStat.update({ where: { id: previous!.id }, data: { observedAt } });
      if (participationStatus === "PLAYED") {
        played++;
        const old = scores.find(s => s.matchId === match.id);
        if (!old || old.points !== row.points) {
          const revision = await appendRevision(tx, { streamId: `official-fp:${input.contestId}:${player.id}:${match.id}`, transitionKey: batchId, value: { points: row.points, source }, observedAt, availableAt: observedAt });
          await tx.khlOfficialFantasyScore.upsert({ where: { fantasyPlayerId_matchId: { fantasyPlayerId: player.id, matchId: match.id } }, create: { contestId: input.contestId, fantasyPlayerId: player.id, matchId: match.id, points: row.points, source, observedAt, availableAt: observedAt, revision: revision.sequence }, update: { points: row.points, source, observedAt, availableAt: observedAt, revision: revision.sequence } });
          changed++;
        } else await tx.khlOfficialFantasyScore.update({ where: { id: old.id }, data: { observedAt } });
      } else {
        // A correction from played to DNP/unknown must retract the old FP too.
        const old = scores.find(s => s.matchId === match.id);
        if (old) {
          await appendRevision(tx, { streamId: `official-fp:${input.contestId}:${player.id}:${match.id}`, transitionKey: batchId, value: { points: null, participationStatus, source }, observedAt, availableAt: observedAt });
          await tx.khlOfficialFantasyScore.delete({ where: { id: old.id } }); changed++;
        }
        if (participationStatus === "DNP") dnp++;
      }
    }
    // Current club is a dated snapshot, not a backdated transfer claim.
    const membership = await tx.khlRosterMembership.findFirst({ where: { playerId: player.playerId, seasonId: player.contest.seasonId, endsAt: null }, orderBy: { startsAt: "desc" } });
    if (!membership || membership.teamId !== teamId) {
      if (membership) await tx.khlRosterMembership.update({ where: { id: membership.id }, data: { endsAt: observedAt } });
      await tx.khlRosterMembership.create({ data: { playerId: player.playerId, seasonId: player.contest.seasonId, teamId, startsAt: observedAt, source, observedAt } }); changed++;
    }
    await bindExternalEntity(tx, { provider: "SPORTS_RU", entityType: "team", providerScope: "hockey-club", externalId: profile.clubSlug, canonicalId: teamId, evidence: source, verifiedAt: observedAt });
    for (const row of profile.fixtures) {
      const match = matchFor(row); if (!match || row.week === null) continue;
      const providerWeekId = String(row.week);
      const week = await tx.khlFantasyWeek.upsert({ where: { contestId_providerWeekId: { contestId: input.contestId, providerWeekId } }, create: { contestId: input.contestId, providerWeekId, label: `Неделя ${row.week}`, sourceUrl: source, verified: false }, update: {} });
      const assignment = await tx.khlMatchFantasyWeek.findUnique({ where: { contestId_matchId: { contestId: input.contestId, matchId: match.id } } });
      if (assignment && assignment.weekId !== week.id) throw new Error("WEEK_ASSIGNMENT_CONFLICT");
      if (!assignment) { await tx.khlMatchFantasyWeek.create({ data: { contestId: input.contestId, matchId: match.id, weekId: week.id } }); changed++; }
    }
    if (changed) await tx.khlContest.update({ where: { id: input.contestId }, data: { revision: { increment: 1 } } });
    return { changed, played, dnp, quarantined };
  }, { timeout: 30000 });
}
