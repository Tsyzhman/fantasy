import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tableExportResponse } from "@/lib/table-export";
import { buildLeagueStartingXiTable } from "@/machete/league-starting-xi-export";
import { loadSharedLeagueSeason } from "@/machete/shared_read_model";
import { loadCachedFantasySquadPlayerPool } from "@/machete/squad_planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request, { params }: { params: Promise<{ leagueId: string }> }) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rawLeagueId = (await params).leagueId;
  const season = new URL(request.url).searchParams.get("season")?.trim() ?? "";
  const leagueId = parsePositiveBigInt(rawLeagueId);
  if (!leagueId || !season || season.length > 32) {
    return jsonError("INVALID_SCOPE", "A valid leagueId and season are required.", 400);
  }

  const [league, leagueSeason] = await Promise.all([
    loadSharedLeagueSeason(prisma, leagueId, season),
    prisma.leagueSeason.findUnique({
      where: { leagueId_season: { leagueId, season } },
      select: {
        teams: {
          where: { active: true },
          select: {
            teamId: true,
            team: { select: { name: true } }
          }
        }
      }
    })
  ]);
  if (!league || !leagueSeason) return jsonError("LEAGUE_SEASON_NOT_FOUND", "League season not found.", 404);

  const playerPool = await loadCachedFantasySquadPlayerPool(prisma, auth.user.id, league);
  const playersByTeamId = new Map<string, typeof playerPool>();
  for (const player of playerPool) {
    if (!player.teamId) continue;
    const players = playersByTeamId.get(player.teamId) ?? [];
    players.push(player);
    playersByTeamId.set(player.teamId, players);
  }

  const table = buildLeagueStartingXiTable(
    leagueSeason.teams.map((team) => ({
      id: team.teamId,
      name: team.team.name,
      players: (playersByTeamId.get(String(team.teamId)) ?? []).map((player) => ({
        name: player.fotmobName || player.name,
        position: player.positionGroup,
        shirtNumber: null,
        isStarter: player.isStarter,
        startProbability: player.startProbability,
        expectedMinutes: player.expectedMinutes,
        predictedFp: player.predictedFp
      }))
    }))
  );

  return tableExportResponse({
    ...table,
    format: "xlsx",
    filename: `starting-xi-${rawLeagueId}-${season.replaceAll("/", "-")}`,
    sheetName: "Starting XI"
  });
});

function parsePositiveBigInt(value: string) {
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
