import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

export type FantasyProviderRoundInput = {
  providerRoundId: string;
  ordinal: number;
  name: string;
  status: string | null;
  deadlineAt: Date | null;
  startsAt: Date | null;
  finishedAt: Date | null;
};

export type FantasyProviderFixtureInput = {
  providerFixtureId: string;
  providerRoundId: string | null;
  providerHomeTeamId: string;
  providerAwayTeamId: string;
  kickoffAt: Date | null;
  status: string | null;
  sourceRoundLabel: string | null;
};

export type FantasyProviderScheduleInput = {
  contestId: string;
  provider: string;
  leagueId: bigint;
  season: string;
  seasonAliases?: readonly string[];
  fetchedAt: Date;
  rounds: readonly FantasyProviderRoundInput[];
  fixtures: readonly FantasyProviderFixtureInput[];
  teamIds: ReadonlyMap<string, bigint | null>;
};

type CoreScheduleMatch = {
  id: bigint;
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  matchDate: Date | null;
};

const fixtureMatchToleranceMs = 7 * 24 * 60 * 60 * 1_000;
const maximumProviderRoundOrdinal = 999_999;

/**
 * Replaces one contest's provider schedule only after the complete payload has
 * passed duplicate and referential validation. The caller must run this inside
 * the same transaction as its provider snapshot (or an isolated transaction).
 */
export async function replaceFantasyProviderSchedule(
  tx: Prisma.TransactionClient,
  input: FantasyProviderScheduleInput
) {
  validateFantasyProviderSchedule(input.rounds, input.fixtures);

  const provider = input.provider.trim().toUpperCase();
  const providerRoundIds = input.rounds.map((round) => round.providerRoundId);
  const providerFixtureIds = input.fixtures.map((fixture) => fixture.providerFixtureId);
  const coreMatches = await tx.coreMatch.findMany({
    where: {
      leagueId: input.leagueId,
      season: { in: [...new Set([input.season, ...(input.seasonAliases ?? [])])] }
    },
    select: { id: true, homeTeamId: true, awayTeamId: true, matchDate: true }
  });
  const existingFixtures = await tx.fantasyProviderFixture.findMany({
    where: { contestId: input.contestId },
    select: { providerFixtureId: true, matchId: true }
  });
  const existingMatchIdByFixtureId = new Map(
    existingFixtures.flatMap((fixture) => fixture.matchId === null
      ? []
      : [[fixture.providerFixtureId, fixture.matchId] as const])
  );
  const coreMatchById = new Map(coreMatches.map((match) => [String(match.id), match]));

  // The payload is fully validated above and this runs in a transaction, so
  // removing stale rows before upserts cannot expose a partial schedule. It
  // also releases unique round ordinals if a provider replaces an external
  // tour ID and releases stale CoreMatch assignments.
  await tx.fantasyProviderFixture.deleteMany({
    where: {
      contestId: input.contestId,
      providerFixtureId: { notIn: providerFixtureIds }
    }
  });
  await tx.fantasyProviderRound.deleteMany({
    where: {
      contestId: input.contestId,
      providerRoundId: { notIn: providerRoundIds }
    }
  });

  // Release the two secondary unique keys before provider IDs are upserted.
  // A provider can insert/reorder tours or reassign a fixture to a corrected
  // CoreMatch without changing its own IDs. The temporary values are visible
  // only inside this transaction and roll back with the rest of the schedule.
  await tx.fantasyProviderRound.updateMany({
    where: { contestId: input.contestId },
    data: { ordinal: { increment: 1_000_000 } }
  });
  await tx.fantasyProviderFixture.updateMany({
    where: { contestId: input.contestId },
    data: { matchId: null }
  });

  const roundIdByProviderId = new Map<string, string>();
  for (const round of input.rounds) {
    const stored = await tx.fantasyProviderRound.upsert({
      where: {
        contestId_providerRoundId: {
          contestId: input.contestId,
          providerRoundId: round.providerRoundId
        }
      },
      update: {
        provider,
        ordinal: round.ordinal,
        name: round.name,
        status: round.status,
        deadlineAt: round.deadlineAt,
        startsAt: round.startsAt,
        finishedAt: round.finishedAt,
        fetchedAt: input.fetchedAt
      },
      create: {
        contestId: input.contestId,
        provider,
        providerRoundId: round.providerRoundId,
        ordinal: round.ordinal,
        name: round.name,
        status: round.status,
        deadlineAt: round.deadlineAt,
        startsAt: round.startsAt,
        finishedAt: round.finishedAt,
        fetchedAt: input.fetchedAt
      },
      select: { id: true }
    });
    roundIdByProviderId.set(round.providerRoundId, stored.id);
  }

  let matchedFixtures = 0;
  let teamMappedFixtures = 0;
  let unmatchedFixtures = 0;
  const claimedMatchIds = new Set<string>();
  for (const fixture of input.fixtures) {
    const homeTeamId = input.teamIds.get(fixture.providerHomeTeamId) ?? null;
    const awayTeamId = input.teamIds.get(fixture.providerAwayTeamId) ?? null;
    const match = resolveCoreScheduleMatch({
      fixture,
      homeTeamId,
      awayTeamId,
      coreMatches,
      existingMatchId: existingMatchIdByFixtureId.get(fixture.providerFixtureId) ?? null,
      coreMatchById
    });
    const uniqueMatch = match && !claimedMatchIds.has(String(match.id)) ? match : null;
    if (uniqueMatch) claimedMatchIds.add(String(uniqueMatch.id));
    const mappingStatus = uniqueMatch
      ? "MATCHED"
      : homeTeamId !== null && awayTeamId !== null
        ? "TEAM_MAPPED"
        : "UNMATCHED";
    if (mappingStatus === "MATCHED") matchedFixtures += 1;
    else if (mappingStatus === "TEAM_MAPPED") teamMappedFixtures += 1;
    else unmatchedFixtures += 1;

    const data = {
      roundId: fixture.providerRoundId ? roundIdByProviderId.get(fixture.providerRoundId) ?? null : null,
      provider,
      providerHomeTeamId: fixture.providerHomeTeamId,
      providerAwayTeamId: fixture.providerAwayTeamId,
      homeTeamId,
      awayTeamId,
      matchId: uniqueMatch?.id ?? null,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      sourceRoundLabel: fixture.sourceRoundLabel,
      mappingStatus,
      mappingConfidence: uniqueMatch ? 1 : homeTeamId !== null && awayTeamId !== null ? 0.8 : 0,
      matchedBy: uniqueMatch
        ? existingMatchIdByFixtureId.get(fixture.providerFixtureId) === uniqueMatch.id
          ? "EXISTING_PROVIDER_FIXTURE_MAP"
          : "EXACT_TEAMS_KICKOFF"
        : homeTeamId !== null && awayTeamId !== null
          ? "PROVIDER_TEAM_MAPS"
          : null,
      fetchedAt: input.fetchedAt
    };
    await tx.fantasyProviderFixture.upsert({
      where: {
        contestId_providerFixtureId: {
          contestId: input.contestId,
          providerFixtureId: fixture.providerFixtureId
        }
      },
      update: data,
      create: {
        contestId: input.contestId,
        providerFixtureId: fixture.providerFixtureId,
        ...data
      }
    });
  }

  const revision = fantasyProviderScheduleRevision(provider, input.rounds, input.fixtures, input.teamIds);
  await tx.fantasyContest.update({
    where: { id: input.contestId },
    data: { scheduleRevision: revision, scheduleSyncedAt: input.fetchedAt }
  });
  return {
    revision,
    rounds: input.rounds.length,
    fixtures: input.fixtures.length,
    matchedFixtures,
    teamMappedFixtures,
    unmatchedFixtures
  };
}

export function validateFantasyProviderSchedule(
  rounds: readonly FantasyProviderRoundInput[],
  fixtures: readonly FantasyProviderFixtureInput[]
) {
  if (rounds.length === 0) throw new Error("Provider schedule contains no rounds; preserving the previous schedule.");
  if (fixtures.length === 0) throw new Error("Provider schedule contains no fixtures; preserving the previous schedule.");
  const roundIds = new Set<string>();
  const ordinals = new Set<number>();
  for (const round of rounds) {
    if (!round.providerRoundId.trim()) throw new Error("Provider schedule contains an empty round ID.");
    if (!Number.isSafeInteger(round.ordinal) || round.ordinal <= 0 || round.ordinal > maximumProviderRoundOrdinal) {
      throw new Error(`Provider round ${round.providerRoundId} has an invalid ordinal.`);
    }
    if (roundIds.has(round.providerRoundId)) throw new Error(`Provider schedule contains duplicate round ${round.providerRoundId}.`);
    if (ordinals.has(round.ordinal)) throw new Error(`Provider schedule contains duplicate round ordinal ${round.ordinal}.`);
    roundIds.add(round.providerRoundId);
    ordinals.add(round.ordinal);
  }
  const fixtureIds = new Set<string>();
  for (const fixture of fixtures) {
    if (!fixture.providerFixtureId.trim()) throw new Error("Provider schedule contains an empty fixture ID.");
    if (fixtureIds.has(fixture.providerFixtureId)) throw new Error(`Provider schedule contains duplicate fixture ${fixture.providerFixtureId}.`);
    if (fixture.providerRoundId !== null && !roundIds.has(fixture.providerRoundId)) {
      throw new Error(`Provider fixture ${fixture.providerFixtureId} references missing round ${fixture.providerRoundId}.`);
    }
    if (!fixture.providerHomeTeamId.trim() || !fixture.providerAwayTeamId.trim()) {
      throw new Error(`Provider fixture ${fixture.providerFixtureId} has an empty team ID.`);
    }
    if (fixture.providerHomeTeamId === fixture.providerAwayTeamId) {
      throw new Error(`Provider fixture ${fixture.providerFixtureId} has the same home and away team.`);
    }
    fixtureIds.add(fixture.providerFixtureId);
  }
}

export function fantasyProviderScheduleRevision(
  provider: string,
  rounds: readonly FantasyProviderRoundInput[],
  fixtures: readonly FantasyProviderFixtureInput[],
  teamIds: ReadonlyMap<string, bigint | null> = new Map()
) {
  const canonical = {
    provider,
    rounds: [...rounds]
      .sort((left, right) => left.ordinal - right.ordinal || left.providerRoundId.localeCompare(right.providerRoundId))
      .map((round) => ({
        ...round,
        deadlineAt: round.deadlineAt?.toISOString() ?? null,
        startsAt: round.startsAt?.toISOString() ?? null,
        finishedAt: round.finishedAt?.toISOString() ?? null
      })),
    fixtures: [...fixtures]
      .sort((left, right) => left.providerFixtureId.localeCompare(right.providerFixtureId))
      .map((fixture) => ({ ...fixture, kickoffAt: fixture.kickoffAt?.toISOString() ?? null })),
    teamIds: [...teamIds]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([providerTeamId, internalTeamId]) => [providerTeamId, internalTeamId === null ? null : String(internalTeamId)])
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function resolveCoreScheduleMatch(input: {
  fixture: FantasyProviderFixtureInput;
  homeTeamId: bigint | null;
  awayTeamId: bigint | null;
  coreMatches: readonly CoreScheduleMatch[];
  existingMatchId: bigint | null;
  coreMatchById: ReadonlyMap<string, CoreScheduleMatch>;
}) {
  if (input.homeTeamId === null || input.awayTeamId === null) return null;
  const existing = input.existingMatchId === null ? null : input.coreMatchById.get(String(input.existingMatchId)) ?? null;
  if (existing?.homeTeamId === input.homeTeamId && existing.awayTeamId === input.awayTeamId) return existing;

  const pair = input.coreMatches.filter((match) =>
    match.homeTeamId === input.homeTeamId && match.awayTeamId === input.awayTeamId
  );
  if (pair.length === 1) {
    const candidate = pair[0];
    if (!input.fixture.kickoffAt || !candidate.matchDate) return candidate;
    return Math.abs(candidate.matchDate.getTime() - input.fixture.kickoffAt.getTime()) <= fixtureMatchToleranceMs
      ? candidate
      : null;
  }
  if (!input.fixture.kickoffAt) return null;
  const ranked = pair
    .filter((match) => match.matchDate)
    .map((match) => ({ match, distance: Math.abs(match.matchDate!.getTime() - input.fixture.kickoffAt!.getTime()) }))
    .filter((entry) => entry.distance <= fixtureMatchToleranceMs)
    .sort((left, right) => left.distance - right.distance || Number(left.match.id - right.match.id));
  return ranked.length === 1 || (ranked[0] && ranked[1] && ranked[0].distance < ranked[1].distance)
    ? ranked[0]?.match ?? null
    : null;
}
