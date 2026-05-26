import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WatchlistSource = "machete" | "baltika";

type WatchlistPlayerInput = {
  id: string;
  name: string;
  teamName: string | null;
  position: string | null;
};

const maxWatchlistPlayers = 32;
const validSources = new Set<WatchlistSource>(["machete", "baltika"]);

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const source = sourceValue(new URL(request.url).searchParams.get("source"));
  if (!source) return badRequest("source must be machete or baltika.");

  return NextResponse.json({ players: await loadWatchlist(userId, source) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const body = await readJsonObject(request);
  const source = sourceValue(body.source);
  const player = playerInput(body.player);
  if (!source) return badRequest("source must be machete or baltika.");
  if (!player) return badRequest("player.id and player.name are required.");

  const metadata = inputJson(body.metadata);
  const jsonData = metadata === undefined ? {} : { metadata };

  await prisma.userWatchlistPlayer.upsert({
    where: {
      userId_source_playerKey: {
        userId,
        source,
        playerKey: player.id
      }
    },
    create: {
      userId,
      source,
      playerKey: player.id,
      playerName: player.name,
      teamName: player.teamName,
      position: player.position,
      ...jsonData
    },
    update: {
      playerName: player.name,
      teamName: player.teamName,
      position: player.position,
      ...jsonData
    }
  });

  await trimWatchlist(userId, source);
  return NextResponse.json({ players: await loadWatchlist(userId, source) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const params = new URL(request.url).searchParams;
  const source = sourceValue(params.get("source"));
  const playerKey = trimmedString(params.get("playerKey"), 200);
  if (!source) return badRequest("source must be machete or baltika.");
  if (!playerKey) return badRequest("playerKey is required.");

  await prisma.userWatchlistPlayer.deleteMany({
    where: {
      userId,
      source,
      playerKey
    }
  });

  return NextResponse.json({ players: await loadWatchlist(userId, source) });
}

async function loadWatchlist(userId: string, source: WatchlistSource) {
  const players = await prisma.userWatchlistPlayer.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: maxWatchlistPlayers
  });

  return players.map((player) => ({
    id: player.playerKey,
    name: player.playerName,
    teamName: player.teamName,
    position: player.position,
    savedAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString()
  }));
}

async function trimWatchlist(userId: string, source: WatchlistSource) {
  const overflow = await prisma.userWatchlistPlayer.findMany({
    where: { userId, source },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: maxWatchlistPlayers,
    select: { id: true }
  });

  if (overflow.length === 0) return;

  await prisma.userWatchlistPlayer.deleteMany({
    where: { id: { in: overflow.map((player) => player.id) }, userId, source }
  });
}

function sourceValue(value: unknown): WatchlistSource | null {
  return typeof value === "string" && validSources.has(value as WatchlistSource) ? (value as WatchlistSource) : null;
}

function playerInput(value: unknown): WatchlistPlayerInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = trimmedString(record.id, 200);
  const name = trimmedString(record.name, 120);
  if (!id || !name) return null;

  return {
    id,
    name,
    teamName: optionalString(record.teamName, 120),
    position: optionalString(record.position, 80)
  };
}

function trimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function optionalString(value: unknown, maxLength: number) {
  return trimmedString(value, maxLength);
}

function inputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object") return undefined;

  try {
    if (JSON.stringify(value).length > 20_000) return undefined;
  } catch {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function badRequest(message: string) {
  return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400 });
}
