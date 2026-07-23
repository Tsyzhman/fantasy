import type { PrismaClient, UserFranchise } from "@prisma/client";

import { startingXiAlternativeRoundPoints, startingXiFoontasyPoints, startingXiRoundPoints } from "@/components/machete/fantasy-squad-ui";
import { nextAlternativeFantasyPoints } from "@/machete/squad_logic";
import type { SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import { loadCachedFantasySquadPlayerPool } from "@/machete/squad_planner";

export type AdminFranchiseSquadSummary = {
  userId: string;
  userName: string;
  email: string;
  isActive: boolean;
  squadName: string | null;
  squadUpdatedAt: Date | null;
  selectedCount: number;
  starterCount: number;
  captainName: string | null;
  fp: number | null;
  alternativeFp: number | null;
  alternativeBreakdown: Array<{ name: string; points: number; multiplier: number }>;
  foontasyFp: number | null;
  foontasyAvailable: number;
  alternativeIssuePlayerNames: string[];
  error: string | null;
};

export async function loadAdminFranchiseSquadSummaries(
  prisma: PrismaClient,
  league: SharedLeagueSeasonOption,
  franchise: UserFranchise,
  options: { includeInactive?: boolean } = {}
): Promise<AdminFranchiseSquadSummary[]> {
  const users = await prisma.user.findMany({
    where: { franchise, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, isActive: true }
  });
  if (users.length === 0) return [];

  const squads = await prisma.userFantasySquad.findMany({
    where: {
      userId: { in: users.map((user) => user.id) },
      leagueId: league.leagueId,
      season: league.season
    },
    include: { players: { orderBy: { slotIndex: "asc" } } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
  const latestSquadByUser = new Map<string, (typeof squads)[number]>();
  for (const squad of squads) {
    if (!latestSquadByUser.has(squad.userId)) latestSquadByUser.set(squad.userId, squad);
  }

  return Promise.all(users.map(async (user) => {
    const squad = latestSquadByUser.get(user.id);
    const base = {
      userId: user.id,
      userName: user.name || user.email,
      email: user.email,
      isActive: user.isActive,
      squadName: squad?.name ?? null,
      squadUpdatedAt: squad?.updatedAt ?? null,
      selectedCount: squad?.players.length ?? 0,
      starterCount: squad?.players.filter((player) => player.isStarter).length ?? 0
    };
    if (!squad) return { ...base, captainName: null, fp: null, alternativeFp: null, alternativeBreakdown: [], foontasyFp: null, foontasyAvailable: 0, alternativeIssuePlayerNames: [], error: null };

    try {
      const pool = await loadCachedFantasySquadPlayerPool(prisma, user.id, league);
      const poolById = new Map(pool.map((player) => [player.playerId, player]));
      const starterSelections = squad.players.filter((player) => player.isStarter);
      const starters = starterSelections.flatMap((selection) => {
        const player = poolById.get(String(selection.playerId));
        return player ? [player] : [];
      });
      const captainId = String(squad.players.find((player) => player.isCaptain)?.playerId ?? "") || null;
      const captainName = captainId ? poolById.get(captainId)?.name ?? null : null;
      const poolComplete = starters.length === starterSelections.length;
      const foontasy = startingXiFoontasyPoints(starters, captainId);
      const alternativeIssuePlayerNames = franchiseSquadAlternativeIssues(starterSelections, poolById);
      const alternativeBreakdown = starters.flatMap((player) => {
        const points = nextAlternativeFantasyPoints(player);
        return typeof points === "number" && Number.isFinite(points)
          ? [{ name: player.name, points, multiplier: player.playerId === captainId ? 2 : 1 }]
          : [];
      });

      return {
        ...base,
        captainName,
        fp: poolComplete ? startingXiRoundPoints(starters, 0, captainId) : null,
        alternativeFp: poolComplete ? startingXiAlternativeRoundPoints(starters, 0, captainId) : null,
        alternativeBreakdown,
        foontasyFp: poolComplete ? foontasy.total : null,
        foontasyAvailable: foontasy.available,
        alternativeIssuePlayerNames,
        error: poolComplete ? null : `В пуле найдено ${starters.length} из ${starterSelections.length} игроков старта.`
      };
    } catch (error) {
      return {
        ...base,
        captainName: null,
        fp: null,
        alternativeFp: null,
        alternativeBreakdown: [],
        foontasyFp: null,
        foontasyAvailable: 0,
        alternativeIssuePlayerNames: [],
        error: error instanceof Error ? error.message : "Не удалось рассчитать состав."
      };
    }
  }));
}

export function franchiseSquadAlternativeIssues(
  selections: Array<{ playerId: bigint; isStarter?: boolean }>,
  playersById: ReadonlyMap<string, {
    name: string;
    alternativePredictedFp?: number | null;
    alternativeRoundPoints?: Array<number | null>;
  }>
) {
  return selections.filter((selection) => selection.isStarter !== false).flatMap((selection) => {
    const player = playersById.get(String(selection.playerId));
    if (!player) return [`Игрок #${selection.playerId} (нет в пуле)`];
    const alternativePoints = nextAlternativeFantasyPoints(player);
    return alternativePoints === null || alternativePoints === 0
      ? [player.name]
      : [];
  });
}
