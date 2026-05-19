import type { PrismaClient } from "@prisma/client";

import { ingest_match, persist_match_payload } from "@/core_data/ingestion";
import { sourceIdToBigInt } from "@/core_data/models";

import { createFotMobClient } from "./client";
import type { FotMobFixtureDetails } from "./types";

type FixtureForShotSync = {
  id: string;
  providerFixtureId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export async function syncMacheteMatchShots(prisma: PrismaClient, fixture: FixtureForShotSync, details: FotMobFixtureDetails) {
  const matchId = sourceIdToBigInt(fixture.providerFixtureId ?? fixture.id, "match");
  const result = await persist_match_payload(prisma, details, {
    matchId,
    fetched: false
  });

  return { shotsSynced: result.shotsParsed };
}

export async function syncMacheteLeagueShots(prisma: PrismaClient, leagueId: string) {
  const league = await prisma.macheteLeague.findUnique({
    where: { id: leagueId },
    select: { id: true, providerLeagueId: true, season: true }
  });
  if (!league) throw new Error("Machete league not found.");

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId,
      status: { not: "SEASON_AGGREGATE" },
      providerFixtureId: { not: null }
    },
    orderBy: { kickoffAt: "desc" },
    select: {
      id: true,
      providerFixtureId: true
    }
  });

  const client = createFotMobClient();
  let matchesChecked = 0;
  let shotsSynced = 0;
  let matchesSkipped = 0;

  for (const fixture of fixtures) {
    if (!fixture.providerFixtureId) continue;
    const result = await ingest_match(prisma, fixture.providerFixtureId, {
      client,
      leagueId: league.providerLeagueId ?? league.id,
      season: league.season
    });
    matchesChecked += 1;
    shotsSynced += result.shotsParsed;
    if (result.skipped) matchesSkipped += 1;
  }

  return { matchesChecked, matchesSkipped, shotsSynced };
}
