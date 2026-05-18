import type { PrismaClient } from "@prisma/client";

import { normalizeName } from "@/lib/text";

export async function runMacheteEntityMatching(prisma: PrismaClient, leagueId: string) {
  const [macheteTeams, internalTeams] = await Promise.all([
    prisma.macheteTeam.findMany({ where: { leagueId } }),
    prisma.team.findMany()
  ]);

  const teamMatches = [];
  for (const macheteTeam of macheteTeams) {
    if (!macheteTeam.providerTeamId) continue;
    const normalized = normalizeName(macheteTeam.name);
    const exact = internalTeams.find((team) => normalizeName(team.name) === normalized);
    const partial = exact ?? internalTeams.find((team) => normalized.includes(normalizeName(team.name)) || normalizeName(team.name).includes(normalized));

    const match = await prisma.providerEntityMap.upsert({
      where: {
        provider_providerEntityType_providerEntityId_internalEntityType: {
          provider: "FOTMOB",
          providerEntityType: "TEAM",
          providerEntityId: macheteTeam.providerTeamId,
          internalEntityType: "TEAM"
        }
      },
      update: {
        internalEntityId: partial?.id ?? null,
        confidence: exact ? 1 : partial ? 0.74 : 0,
        matchedBy: partial ? "NAME" : null,
        status: partial ? "MATCHED" : "UNMATCHED"
      },
      create: {
        provider: "FOTMOB",
        providerEntityType: "TEAM",
        providerEntityId: macheteTeam.providerTeamId,
        internalEntityType: "TEAM",
        internalEntityId: partial?.id ?? null,
        confidence: exact ? 1 : partial ? 0.74 : 0,
        matchedBy: partial ? "NAME" : null,
        status: partial ? "MATCHED" : "UNMATCHED"
      }
    });
    teamMatches.push(match);
  }

  return {
    total: teamMatches.length,
    matched: teamMatches.filter((match) => match.status === "MATCHED").length,
    unmatched: teamMatches.filter((match) => match.status !== "MATCHED").length
  };
}
