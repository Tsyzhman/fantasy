import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { fantasyRulesForLeague, saveFantasySquad } from "@/machete/squad_planner";
import type { FantasySquadSelection } from "@/machete/squad_logic";

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
  const rosterPlayerIds = new Set(
    (
      await prisma.teamPlayerSeason.findMany({
        where: {
          leagueId,
          season,
          active: true,
          playerId: { in: selections.map((selection) => BigInt(selection.playerId)) }
        },
        select: { playerId: true }
      })
    ).map((row) => String(row.playerId))
  );
  const safeSelections = selections.filter((selection) => rosterPlayerIds.has(selection.playerId));
  const contest = await prisma.sportsRuFantasyContest.findUnique({
    where: {
      provider_leagueId_season: {
        provider: "SPORTS_RU",
        leagueId,
        season
      }
    }
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

  if (safeSelections.length > rules.squadSize) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: `Squad can contain at most ${rules.squadSize} players.` } }, { status: 400 });
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
