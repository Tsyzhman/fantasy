import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { setSportsRuPlayerMapping } from "@/machete/sports_ru_player_mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withApiHandler(async (request: Request) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const body = await readJsonObject(request);
  const priceId = typeof body.priceId === "string" ? body.priceId : "";
  const playerId = body.playerId === null || body.playerId === "" ? null : parseBigInt(body.playerId);

  if (!priceId) {
    return badRequest("priceId is required.");
  }
  if (body.playerId !== null && body.playerId !== "" && !playerId) {
    return badRequest("playerId must be empty or integer-like.");
  }

  try {
    const mapping = await setSportsRuPlayerMapping(prisma, {
      priceId,
      playerId
    });
    return NextResponse.json({ mapping });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to save mapping.");
  }
});

function parseBigInt(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function badRequest(message: string) {
  return jsonError("BAD_REQUEST", message, 400);
}
