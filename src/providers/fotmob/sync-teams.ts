import type { PrismaClient } from "@prisma/client";

import { createFotMobClient } from "./client";
import { normalizeMachetePlayer, normalizeMacheteTeam } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";

export async function syncMacheteTeams(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  const teams = await client.getTeams(league.providerLeagueId ?? league.id, league.season ?? undefined);
  const syncedTeams = [];
  const providerTeamIds = teams.map((team) => team.id);

  if (providerTeamIds.length > 0) {
    const staleTeams = await prisma.macheteTeam.findMany({
      where: {
        leagueId: league.id,
        provider: "FOTMOB",
        providerTeamId: {
          notIn: providerTeamIds
        }
      },
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
