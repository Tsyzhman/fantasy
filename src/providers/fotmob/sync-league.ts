import type { Prisma, PrismaClient } from "@prisma/client";

import { leagueSeeds } from "@/lib/leagues/seed-data";

import { createFotMobClient } from "./client";
import { storeMacheteRawPayload } from "./raw-payloads";

export async function syncMacheteLeagueMetadata(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  const providerLeague = await client.getLeague(league.providerLeagueId ?? league.id, league.season ?? undefined);
  const seededLeague = leagueSeeds.find((item) => item.fotMobLeagueId === providerLeague.id);

  await storeMacheteRawPayload(prisma, {
    entityType: "LEAGUE",
    providerEntityId: providerLeague.id,
    endpoint: "getLeague",
    payload: providerLeague
  });

  return prisma.macheteLeague.update({
    where: { id: league.id },
    data: {
      provider: "FOTMOB",
      providerLeagueId: providerLeague.id,
      name: providerLeague.name,
      country: seededLeague?.country ?? providerLeague.country ?? null,
      season: providerLeague.season ?? league.season,
      logoUrl: providerLeague.logoUrl ?? null,
      status: "SYNCED",
      lastSyncedAt: new Date()
    } satisfies Prisma.MacheteLeagueUpdateInput
  });
}
