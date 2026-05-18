import type { PrismaClient } from "@prisma/client";

import { createFotMobClient } from "./client";
import { normalizeMachetePlayer, normalizeMacheteTeam } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";
import type { FotMobTeam } from "./types";

export async function syncMacheteTeams(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  const providerLeagueId = league.providerLeagueId ?? league.id;
  const teams = filterMacheteTeamsForSync({
    teams: await client.getTeams(providerLeagueId, league.season ?? undefined),
    providerLeagueId,
    season: league.season ?? undefined
  });
  const syncedTeams = [];
  const providerTeamIds = teams.map((team) => team.id);

  if (providerTeamIds.length > 0) {
    const staleTeams = await prisma.macheteTeam.findMany({
      where: staleFotMobTeamWhere(league.id, providerTeamIds),
      select: { id: true }
    });

    if (staleTeams.length > 0) {
      const staleTeamIds = staleTeams.map((team) => team.id);
      await prisma.machetePlayer.deleteMany({
        where: {
          teamId: { in: staleTeamIds },
          provider: "FOTMOB"
        }
      });
      await prisma.macheteTeam.deleteMany({
        where: {
          id: { in: staleTeamIds }
        }
      });
    }
  }

  await storeMacheteRawPayload(prisma, {
    entityType: "TEAM_COLLECTION",
    providerEntityId: league.providerLeagueId ?? league.id,
    endpoint: "getTeams",
    payload: teams
  });

  for (const team of teams) {
    const normalized = normalizeMacheteTeam(team, league.id, league.providerLeagueId);
    const macheteTeam = await prisma.macheteTeam.upsert({
      where: {
        provider_providerTeamId: {
          provider: "FOTMOB",
          providerTeamId: team.id
        }
      },
      update: normalized,
      create: normalized
    });

    for (const player of team.players) {
      await prisma.machetePlayer.upsert({
        where: {
          provider_providerPlayerId: {
            provider: "FOTMOB",
            providerPlayerId: player.id
          }
        },
        update: normalizeMachetePlayer(player, macheteTeam.id),
        create: normalizeMachetePlayer(player, macheteTeam.id)
      });
    }

    await storeMacheteRawPayload(prisma, {
      entityType: "TEAM",
      providerEntityId: team.id,
      endpoint: "getTeams",
      payload: team
    });

    syncedTeams.push(macheteTeam);
  }

  await prisma.macheteLeague.update({
    where: { id: league.id },
    data: {
      status: "SYNCED",
      lastSyncedAt: new Date()
    }
  });

  return syncedTeams;
}

export function staleFotMobTeamWhere(leagueId: string, providerTeamIds: string[]) {
  return {
    leagueId,
    provider: "FOTMOB",
    OR: [
      {
        providerTeamId: {
          notIn: providerTeamIds
        }
      },
      {
        providerTeamId: null
      }
    ]
  };
}

export function filterMacheteTeamsForSync(input: { teams: FotMobTeam[]; providerLeagueId: string; season?: string }) {
  if (!isWorldCup2026(input.providerLeagueId, input.season)) return input.teams;

  const teamsWithPlayers = input.teams.filter((team) => team.players.length > 0);
  const teamsWithoutPlayers = input.teams.filter((team) => team.players.length === 0);

  if (teamsWithoutPlayers.length > 0) {
    const names = teamsWithoutPlayers
      .slice(0, 12)
      .map((team) => `${team.name} (${team.id})`)
      .join(", ");
    const suffix = teamsWithoutPlayers.length > 12 ? ", ..." : "";
    console.warn(`[fotmob] Ignoring ${teamsWithoutPlayers.length} World Cup teams without players: ${names}${suffix}`);
  }

  return teamsWithPlayers;
}

function isWorldCup2026(providerLeagueId: string, season?: string) {
  return providerLeagueId === "77" && (!season || season === "2026");
}
