import type { PrismaClient } from "@prisma/client";

import { fixtureSyncSeasons } from "@/scoring/machete/match-window";

import { createFotMobClient } from "./client";
import { normalizeMacheteFixture } from "./normalizers";
import { storeMacheteRawPayload } from "./raw-payloads";

type SyncFixtureOptions = {
  includePreviousSeasons?: boolean;
};

export async function syncMacheteFixtures(prisma: PrismaClient, leagueId: string, options: SyncFixtureOptions = {}) {
  const league = await prisma.macheteLeague.findUnique({
    where: { id: leagueId },
    include: { teams: true }
  });
  if (!league) throw new Error("Machete league not found.");

  const client = createFotMobClient();
  const seasons = options.includePreviousSeasons === false ? [league.season ?? null] : fixtureSyncSeasons(league.season, league.providerLeagueId);
  const fixtureSets = await Promise.all(
    seasons.map(async (season) => ({
      season,
      fixtures: await client.getFixtures(league.providerLeagueId ?? league.id, season ?? undefined)
    }))
  );
  const fixtures = dedupeById(fixtureSets.flatMap((set) => set.fixtures));
  const providerFixtureIds = fixtures.map((fixture) => fixture.id);
  const teamIdsByProviderId = new Map(
    league.teams
      .filter((team) => team.providerTeamId)
      .map((team) => [team.providerTeamId as string, team.id])
  );

  for (const fixtureSet of fixtureSets) {
    await storeMacheteRawPayload(prisma, {
      entityType: "FIXTURE_COLLECTION",
      providerEntityId: [league.providerLeagueId ?? league.id, fixtureSet.season ?? "current"].join(":"),
      endpoint: "getFixtures",
      payload: fixtureSet.fixtures
    });
  }

  if (providerFixtureIds.length > 0) {
    await prisma.macheteFixture.deleteMany({
      where: {
        leagueId: league.id,
        provider: "FOTMOB",
        status: { not: "SEASON_AGGREGATE" },
        providerFixtureId: {
          notIn: providerFixtureIds
        }
      }
    });
  }

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

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}
