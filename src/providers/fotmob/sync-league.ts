import type { Prisma, PrismaClient } from "@prisma/client";

import { macheteCatalogByFotMobId } from "@/lib/leagues/machete-catalog";

import { createFotMobClient, type FotMobClient } from "./client";
import { storeMacheteRawPayload } from "./raw-payloads";

type SyncMacheteLeagueMetadataDependencies = {
  client?: Pick<FotMobClient, "getLeague">;
  storeRawPayload?: typeof storeMacheteRawPayload;
};

export async function syncMacheteLeagueMetadata(
  prisma: PrismaClient,
  leagueId: string,
  dependencies: SyncMacheteLeagueMetadataDependencies = {}
) {
  const league = await prisma.macheteLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new Error("Machete league not found.");

  const client = dependencies.client ?? createFotMobClient();
  // Metadata sync is the season-rollover boundary. Asking FotMob for an
  // already stored season pins the league forever and prevents a new season
  // from being discovered.
  const providerLeague = await client.getLeague(league.providerLeagueId ?? league.id);
  const catalogLeague = macheteCatalogByFotMobId(providerLeague.id);

  await (dependencies.storeRawPayload ?? storeMacheteRawPayload)(prisma, {
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
      name: catalogLeague?.name ?? providerLeague.name,
      country: catalogLeague?.country ?? providerLeague.country ?? null,
      season: providerLeague.season ?? league.season,
      logoUrl: providerLeague.logoUrl ?? null,
      status: "SYNCED",
      lastSyncedAt: new Date()
    } satisfies Prisma.MacheteLeagueUpdateInput
  });
}
