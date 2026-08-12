import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON, fplChipCode } from "@/lib/providers/fpl";
import { fplChipAvailabilityFromStoredDefinitions, fplHalfForGameweek, validateFplChipUsage, type FplChipUsage } from "@/lib/providers/fpl-rules";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async () => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
    select: { id: true }
  });
  if (!contest) return NextResponse.json({ provider: FPL_PROVIDER, usages: [], states: [], reason: "CONTEST_NOT_SYNCED" }, { status: 503 });
  const [usages, states] = await Promise.all([
    prisma.fantasyChipUsage.findMany({
      where: { userId: auth.user.id, contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON },
      orderBy: { gameweek: "asc" },
      select: { gameweek: true, code: true, status: true, source: true, observedAt: true, updatedAt: true }
    }),
    prisma.fantasyUserGameweekState.findMany({
      where: { userId: auth.user.id, contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON },
      orderBy: { gameweek: "asc" },
      select: { gameweek: true, bankedFreeTransfers: true, transfersMade: true, transferCost: true, chipCode: true, chipStatus: true }
    })
  ]);
  return NextResponse.json({
    provider: FPL_PROVIDER,
    usages: usages.map((usage) => ({ ...usage, observedAt: usage.observedAt?.toISOString() ?? null, updatedAt: usage.updatedAt.toISOString() })),
    states
  });
});

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  const gameweek = integerValue(body.gameweek);
  const code = fplChipCode(typeof body.code === "string" ? body.code : "");
  const status = body.status === "CANCELLED" ? "CANCELLED" : body.status === "PLANNED" ? "PLANNED" : null;
  if (!gameweek || gameweek < 1 || gameweek > 38 || !code || !status) {
    return jsonError("BAD_REQUEST", "gameweek 1..38, a valid FPL chip, and PLANNED or CANCELLED status are required.", 400);
  }
  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } },
    select: { id: true }
  });
  if (!contest) return jsonError("CONTEST_NOT_SYNCED", "FPL prices and chip definitions are not synchronized yet.", 503);
  const half = fplHalfForGameweek(gameweek);
  if (!half) return jsonError("GAMEWEEK_OUT_OF_RANGE", "The gameweek is outside the configured FPL season.", 400);
  const definitions = await prisma.fantasyChipDefinition.findMany({
    where: { contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON },
    select: { id: true, code: true, half: true, rules: true }
  });
  const definition = definitions.find((item) => item.code === code && item.half === half) ?? null;
  if (!definition) return jsonError("CHIP_NOT_AVAILABLE", "This chip is not present in the synchronized official FPL contract for that half.", 409);
  const storedAvailability = fplChipAvailabilityFromStoredDefinitions(definitions);

  const usage = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`fantasy-scout:fpl:chip:${auth.user.id}:${contest.id}:${gameweek}`}))`);
    const existing = await tx.fantasyChipUsage.findUnique({
      where: { userId_contestId_gameweek: { userId: auth.user.id, contestId: contest.id, gameweek } },
      select: { status: true }
    });
    if (existing?.status === "OBSERVED") {
      return {
        ok: false as const,
        code: "OBSERVED_CHIP_IMMUTABLE" as const,
        message: "An observed official chip usage cannot be changed.",
        details: undefined
      };
    }
    if (status === "PLANNED") {
      const previous = await tx.fantasyChipUsage.findMany({
        where: { userId: auth.user.id, contestId: contest.id, status: { not: "CANCELLED" }, gameweek: { not: gameweek } },
        select: { gameweek: true, code: true, status: true }
      });
      const validation = validateFplChipUsage(
        { gameweek, code, status: "PLANNED" },
        previous.flatMap((item) => toChipUsage(item)),
        undefined,
        Object.keys(storedAvailability).length > 0 ? storedAvailability : undefined
      );
      if (!validation.ok) {
        return {
          ok: false as const,
          code: "CHIP_INVALID" as const,
          message: validation.violations[0] ?? "FPL chip usage violates the contract.",
          details: { violations: validation.violations }
        };
      }
    }
    const saved = await tx.fantasyChipUsage.upsert({
      where: { userId_contestId_gameweek: { userId: auth.user.id, contestId: contest.id, gameweek } },
      update: { provider: FPL_PROVIDER, season: FPL_SEASON, code, status, source: "USER", metadata: { half, definitionId: definition.id } },
      create: { userId: auth.user.id, contestId: contest.id, provider: FPL_PROVIDER, season: FPL_SEASON, gameweek, code, status, source: "USER", metadata: { half, definitionId: definition.id } },
      select: { gameweek: true, code: true, status: true, source: true }
    });
    return { ok: true as const, usage: saved };
  });
  if (!usage.ok) return jsonError(usage.code, usage.message, 409, usage.details);
  return NextResponse.json({ provider: FPL_PROVIDER, usage: usage.usage });
});

function toChipUsage(value: { gameweek: number; code: string; status: string }): FplChipUsage[] {
  const code = fplChipCode(value.code);
  return code && (value.status === "PLANNED" || value.status === "OBSERVED" || value.status === "CANCELLED")
    ? [{ gameweek: value.gameweek, code, status: value.status }]
    : [];
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}
