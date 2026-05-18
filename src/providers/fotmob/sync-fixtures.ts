import type { PrismaClient } from "@prisma/client";

import { createFotMobClient } from "./client";
import { normalizeMacheteFixture } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";

export async function syncMacheteFixtures(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({
    where: { id: leagueId },
    include: { teams: true }
  });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  const fixtures = await client.getFixtures(league.providerLeagueId ?? league.id, league.season ?? undefined);
  const teamIdsByProviderId = new Map(
    league.teams
      .filter((team) => team.providerTeamId)
      .map((team) => [team.providerTeamId as string, team.id])
  );

  await storeMacheteRawPayload(prisma, {
    entityType: "FIXTURE_COLLECTION",
    providerEntityId: league.providerLeagueId ?? league.id,
    endpoint: "getFixtures",
    payload: fixtures
  });

  const syncedFixtures = [];
  for (const fixture of fixtures) {
    const normalized = normalizeMacheteFixture(fixture, league.id, teamIdsByProviderId);
    const macheteFixture = await prisma.macheteFixture.upsert({
      where: {
        provider_providerFixtureId: {
          provider: "FOTMOB",
          providerFixtureId: fixture.id
        }
      },
      update: normalized,
      create: normalized
    });

    syncedFixtures.push(macheteFixture);
  }

  await prisma.macheteLeague.update({
    where: { id: league.id },
    data: {
      status: "SYNCED",
      lastSyncedAt: new Date()
    }
  });

  return syncedFixtures;
}
