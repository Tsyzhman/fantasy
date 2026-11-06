/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
import type { PrismaClient } from "@prisma/client";
import { enqueueCurrentXiTeamsSnapshotRefresh } from "./fantasy-player-pool-refresh-queue";
import { applyProbableLineupTeamPlan, type ProbableLineupTeamPlan } from "./probable-lineup-sync";
import { hasUpcomingSorareLineup } from "./sorareinside-protection";
import { normalizeFantasyPosition } from "./squad_logic";

const XI_SIZE = 11;
const SOURCE = "FOTMOB_LAST_PLAYED";

export function loadLastPlayedClubMatch(db: Pick<PrismaClient, "coreMatch">, teamId: bigint, asOf: Date) {
  return db.coreMatch.findFirst({
    where: {
      finished: true,
      cancelled: false,
      matchDate: { lt: asOf },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      matchDate: true,
      homeTeamId: true,
      playerStats: {
        where: { teamId, started: true },
        orderBy: { playerId: "asc" },
        take: XI_SIZE + 1,
        select: { playerId: true, position: true, shirtNumber: true, player: { select: { name: true } } }
      }
    }
  });
}

type LastPlayedClubMatch = Awaited<ReturnType<typeof loadLastPlayedClubMatch>>;

export type LastPlayedXiReport = {
  status: "APPLIED" | "UNCHANGED" | "READY" | "UPCOMING_PREDICTION" | "NEWER_COMPLETED_MATCH" |
    "NO_COMPLETED_MATCH" | "INCOMPLETE_XI" | "ROSTER_MISMATCH" | "APPLY_ERROR";
  matchId?: string;
  kickoff?: string;
  problem?: string;
};

export async function refreshLastPlayedClubXi(db: PrismaClient, input: {
  leagueId: bigint;
  leagueName: string;
  season: string;
  teamId: bigint;
  teamName: string;
  metadata: unknown;
  roster: ReadonlyArray<{ player: { id: bigint }; active: boolean; isStarter: boolean; position: string | null }>;
  match: LastPlayedClubMatch;
  checkedAt: Date;
  apply: boolean;
}): Promise<LastPlayedXiReport> {
  const { match, leagueId, season, teamId, teamName, checkedAt } = input;
  if (hasUpcomingSorareLineup(input.metadata, checkedAt)) return { status: "UPCOMING_PREDICTION" };
  if (!match?.matchDate) return { status: "NO_COMPLETED_MATCH" };

  const provenance = { matchId: String(match.id), kickoff: match.matchDate.toISOString() };
  const goalkeepers = match.playerStats.filter((player) => normalizeFantasyPosition(player.position) === "GK");
  if (match.playerStats.length !== XI_SIZE ||
      new Set(match.playerStats.map((player) => player.playerId)).size !== XI_SIZE || goalkeepers.length !== 1) {
    return { ...provenance, status: "INCOMPLETE_XI" };
  }
  const [keeper] = goalkeepers;
  const starters = [keeper, ...match.playerStats.filter((player) => player !== keeper)];
  const targetPlayerIds = starters.map((player) => player.playerId);
  const active = new Map(input.roster.filter((row) => row.active).map((row) => [row.player.id, row]));
  if (targetPlayerIds.some((id) => !active.has(id)) ||
      normalizeFantasyPosition(active.get(keeper.playerId)?.position) !== "GK" ||
      targetPlayerIds.slice(1).some((id) => normalizeFantasyPosition(active.get(id)?.position) === "GK")) {
    return { ...provenance, status: "ROSTER_MISMATCH" };
  }
  const currentStarterIds = input.roster.filter((row) => row.isStarter).map((row) => row.player.id);
  const current = new Set(currentStarterIds);
  const startersToSet = targetPlayerIds.filter((id) => !current.has(id)).length;
  const target = new Set(targetPlayerIds);
  const startersToClear = currentStarterIds.filter((id) => !target.has(id)).length;
  const status = startersToSet || startersToClear ? "READY" : "UNCHANGED";
  if (!input.apply) return { ...provenance, status };

  const sourceUrl = `https://www.fotmob.com/match/${match.id}`;
  const plan: ProbableLineupTeamPlan = {
    source: SOURCE, sourceUrl, leagueId, leagueName: input.leagueName, season, fetchedAt: checkedAt,
    sourceLineup: {
      source: SOURCE, sourceUrl, sourceTeamCode: String(teamId), sourceFixtureId: provenance.matchId,
      sourceKickoff: provenance.kickoff, teamName, opponentName: null,
      venue: match.homeTeamId === teamId ? "HOME" : "AWAY", formation: null, sourceUpdatedText: null,
      players: starters.map((row) => ({
        name: row.player.name, fullName: null, providerCode: String(row.playerId), shirtNumber: row.shirtNumber
      }))
    },
    teamId, databaseTeamName: teamName, teamMatchedBy: "PROVIDER_CODE", teamConfidence: 1, status,
    playerResolutions: [], currentStarterIds, targetPlayerIds, startersToSet, startersToClear, problems: [],
    lastPlayedMatch: { id: match.id, date: match.matchDate }
  };
  const appliedAt = new Date();
  try {
    const outcome = await applyProbableLineupTeamPlan(db, plan, appliedAt,
      (change, tx) => enqueueCurrentXiTeamsSnapshotRefresh(tx, change),
      async (tx) => {
        const latest = await loadLastPlayedClubMatch(tx, teamId, appliedAt);
        if (latest?.id !== match.id || latest.matchDate?.toISOString() !== provenance.kickoff ||
            latest.playerStats.length !== match.playerStats.length ||
            latest.playerStats.some((row, index) =>
              row.playerId !== match.playerStats[index].playerId || row.position !== match.playerStats[index].position)) {
          throw new Error("SorareInside: last played lineup changed during validation");
        }
        const conflictingClub = await tx.teamPlayerSeason.findFirst({
          where: { leagueId, season, teamId: { not: teamId }, active: true, playerId: { in: targetPlayerIds } },
          select: { playerId: true }
        });
        if (conflictingClub) throw new Error("SorareInside: last played XI includes a player active for another club");
      });
    return { ...provenance, status: outcome.skippedReason ?? outcome.status };
  } catch (error) {
    const problem = error instanceof Error && error.message.startsWith("SorareInside: ")
      ? error.message
      : "Last played XI failed roster validation or publication";
    return { ...provenance, status: "APPLY_ERROR", problem };
  }
}
