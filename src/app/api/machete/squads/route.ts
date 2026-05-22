import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { fantasyRulesForLeague, loadSportsRuFantasyPositionsByPlayerId, saveFantasySquad, sportsRuSeasonAliases } from "@/machete/squad_planner";
import { normalizeFantasyPosition, type FantasyPositionGroup, type FantasySquadRules, type FantasySquadSelection } from "@/machete/squad_logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const leagueId = parseBigInt(body.leagueId);
  const season = typeof body.season === "string" ? body.season : "";
  if (!leagueId || !season) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "leagueId and season are required." } }, { status: 400 });
  }

  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season
      }
    },
    include: {
      league: true
    }
  });
  if (!leagueSeason) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "League season not found." } }, { status: 404 });
  }

  const selections = parseSelections(body.selections);
  const rosterRows = await prisma.teamPlayerSeason.findMany({
    where: {
      leagueId,
      season,
      active: true,
      playerId: { in: selections.map((selection) => BigInt(selection.playerId)) }
    },
    select: { playerId: true, teamId: true, position: true }
  });
  const sportsPositionsByPlayerId = await loadSportsRuFantasyPositionsByPlayerId(prisma, {
    leagueId,
    season
  });
  const rosterByPlayerId = new Map(
    rosterRows.map((row) => {
      const playerId = String(row.playerId);
      return [playerId, { ...row, position: sportsPositionsByPlayerId.get(playerId) ?? row.position }] as const;
    })
  );
  const safeSelections = selections.filter((selection) => rosterByPlayerId.has(selection.playerId));
  const contest = await prisma.sportsRuFantasyContest.findFirst({
    where: {
      provider: "SPORTS_RU",
      leagueId,
      season: { in: sportsRuSeasonAliases(season) }
    },
    orderBy: { lastSyncedAt: "desc" }
  });
  const displayName = macheteLeagueDisplayName({
    id: String(leagueSeason.leagueId),
    name: leagueSeason.name ?? leagueSeason.league.name,
    country: leagueSeason.country ?? leagueSeason.league.country,
    providerLeagueId: String(leagueSeason.leagueId)
  });
  const rules = fantasyRulesForLeague(
    {
      leagueId,
      season,
      name: leagueSeason.name ?? leagueSeason.league.name,
      displayName,
      country: leagueSeason.country ?? leagueSeason.league.country,
      providerLeagueId: String(leagueSeason.leagueId),
      isCurrent: leagueSeason.isCurrent,
      updatedAt: leagueSeason.updatedAt
    },
    contest
  );

  const validationError = validateSquadSelections(safeSelections, rosterByPlayerId, rules);
  if (validationError) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: validationError } }, { status: 400 });
  }

  const squad = await saveFantasySquad(prisma, {
    userId: auth.user!.id,
    leagueId,
    season,
    name: typeof body.name === "string" ? body.name : undefined,
    horizonRounds: parsePositiveInt(body.horizonRounds, 5),
    selections: safeSelections,
    rules
  });

  return NextResponse.json({
    squad: {
      id: squad.id,
      savedPlayers: safeSelections.length
    }
  });
}

function parseSelections(value: unknown): FantasySquadSelection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const selections: FantasySquadSelection[] = [];

  for (const item of value) {
    const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    const playerId = typeof record.playerId === "string" && /^\d+$/.test(record.playerId) ? record.playerId : null;
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    selections.push({
      playerId,
      isStarter: record.isStarter !== false,
      isLocked: record.isLocked === true,
      slotIndex: parsePositiveInt(record.slotIndex, selections.length),
      purchasePrice: numberOrNull(record.purchasePrice)
    });
  }

  return selections;
}

function validateSquadSelections(
  selections: FantasySquadSelection[],
  rosterByPlayerId: Map<string, { playerId: bigint; teamId: bigint | null; position: string | null }>,
  rules: FantasySquadRules
) {
  if (selections.length > rules.squadSize) return `Squad can contain at most ${rules.squadSize} players.`;

  const rosterCounts: Record<FantasyPositionGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const starterCounts: Record<FantasyPositionGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const benchCounts: Record<FantasyPositionGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const teamCounts = new Map<string, number>();
  let starters = 0;

  for (const selection of selections) {
    const rosterRow = rosterByPlayerId.get(selection.playerId);
    if (!rosterRow) continue;
    const position = normalizeFantasyPosition(rosterRow.position);
    rosterCounts[position] += 1;
    if (selection.isStarter) {
      starterCounts[position] += 1;
      starters += 1;
    } else {
      benchCounts[position] += 1;
    }
    if (rosterRow.teamId) {
      const teamId = String(rosterRow.teamId);
      teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
  }

  if (starters > rules.starterSize) return `Starting XI can contain at most ${rules.starterSize} players.`;
  if (starters === rules.starterSize) {
    const starterFieldPlayers = starters - starterCounts.GK;
    if (starterCounts.GK !== 1) return `Starting XI must contain exactly 1 GK.`;
    if (starterFieldPlayers !== 10) return `Starting XI must contain exactly 10 field players.`;
  }
  if (selections.length === rules.squadSize && selections.length - starters !== rules.benchSize) {
    return `Bench must contain exactly ${rules.benchSize} players.`;
  }
  if (selections.length === rules.squadSize) {
    const benchFieldPlayers = rules.benchSize - benchCounts.GK;
    const requiredBenchFieldPlayers = rules.benchSize - 1;
    if (benchCounts.GK !== 1) return `Bench must contain exactly 1 GK.`;
    if (benchFieldPlayers !== requiredBenchFieldPlayers) return `Bench must contain exactly ${requiredBenchFieldPlayers} field players.`;
  }

  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    const rosterLimit = rules.positionLimits[position];
    const starterLimit = rules.starterPositionLimits[position];
    if (rosterCounts[position] > rosterLimit) return `${position} roster limit is ${rosterLimit}.`;
    if (selections.length === rules.squadSize && rosterCounts[position] !== rosterLimit) {
      return `Full squad must contain ${rosterLimit} ${position} players.`;
    }
    if (starterCounts[position] > starterLimit.max) return `${position} starter limit is ${starterLimit.max}.`;
    if (starters === rules.starterSize && starterCounts[position] < starterLimit.min) {
      return `Starting XI needs at least ${starterLimit.min} ${position} players.`;
    }
  }

  for (const count of teamCounts.values()) {
    if (count > rules.maxPlayersPerTeam) return `Squad can contain at most ${rules.maxPlayersPerTeam} players from one team.`;
  }

  return null;
}

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parsePositiveInt(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
